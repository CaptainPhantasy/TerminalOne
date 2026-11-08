'use strict';

const express = require('express');
const path = require('path');
const http = require('http');
const os = require('os');
const { resolveShell } = require('./shell-resolve');
const fs = require('fs');
const { spawn } = require('child_process');

const WebSocket = require('ws');
const pty = require('node-pty');
const { v4: uuidv4 } = require('uuid');

// ─── Constants ────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 11001;
const HOST = process.env.HOST || '127.0.0.1';
const SOCKET_PATH = process.env.TERMINALONE_SOCKET || '';
// Deployment policy is optional and generic; tool-specific configuration lives outside this app.
const policy = process.env.TERMINALONE_POLICY_MODULE
  ? require(path.resolve(process.env.TERMINALONE_POLICY_MODULE)) : null;
const { createRequestBoundary } = require('./request-boundary');
// The release boundary guards a loopback TCP listener by checking the Host
// header against localhost/trusted HTTPS origins. The private Unix socket is
// reached through its own filesystem permissions and the deployment policy's
// origin check instead, so its Host header is not a loopback one.
const enforceRequestBoundary = createRequestBoundary(PORT, process.env.TERMINALONE_TRUSTED_ORIGINS || '');
function requestAllowed(req) {
  if (SOCKET_PATH) return true;
  return enforceRequestBoundary(req);
}
const MAX_CONCURRENT_SESSIONS = 10;

// Input typed in the moment between the socket opening and the shell existing
// used to be discarded without a word, which read as "my typing does not work"
// until the user pressed the key again. Hold it instead and flush on spawn.
const MAX_PENDING_INPUT = 8192;
const PING_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 5_000;
const KILL_GRACE_MS = 1_000;
const MAX_COLS = 500;
const MAX_ROWS = 200;
const STT_MAX_CHUNK_BYTES = 512 * 1024;
const STT_MAX_UTTERANCE_BYTES = 8 * 1024 * 1024;
const STT_TIMEOUT_MS = Number(process.env.TERMINALONE_STT_TIMEOUT_MS || 60_000);

// Voice settings live in the member's home so any STT command and model can be
// chosen without environment variables. Audio is staged under the cache dir so
// it never lands in the shared system temp directory.
const VOICE_CONFIG_PATH = path.join(os.homedir(), '.config', 'terminalone', 'voice.json');
const VOICE_TMP_BASE = path.join(os.homedir(), '.cache', 'terminalone');
const VOICE_DEFAULT_ARGS = '{audio} --model {model} --language {language} --output_format txt --output_dir {dir} --verbose False --fp16 False';
const VOICE_PLACEHOLDERS = new Set(['audio', 'model', 'language', 'dir', 'base', 'output']);

// Resume: when a WS drops unexpectedly, keep the PTY alive this long so the
// client can reconnect to the same session. Output produced while detached
// (and while attached) is buffered in a ring and replayed on resume.
const RESUME_GRACE_MS = 5 * 60 * 1000;

// A shell that cannot start exits immediately. Respawning it without a limit
// produced roughly 26 respawns per second, indefinitely, and looked like a
// frozen terminal. Count rapid exits, back off, then stop and explain.
const RAPID_EXIT_MS = 1500;
const MAX_RAPID_RESPAWNS = 5;
const RESPAWN_BASE_MS = 100;
const RESPAWN_MAX_MS = 5000;
const RESUME_BUFFER_MAX = 512 * 1024;

// ─── In-memory state ──────────────────────────────────────────────────────────

/** @type {Map<string, Session>} */
const activeSessions = new Map();

/** @type {Map<string, NodeJS.Timeout>} */
const pingTimers = new Map();

/** @type {Map<string, NodeJS.Timeout>} */
const pongTimers = new Map();

/** @type {Map<string, NodeJS.Timeout>} */
const graceTimers = new Map();

// ─── Structured logger ───────────────────────────────────────────────────────

/** @param {'info'|'warn'|'error'} level */
function log(level, sessionId, msg, meta = {}) {
  const entry = { ts: new Date().toISOString(), level, sessionId: sessionId || null, msg, ...meta };
  if (level === 'error') console.error(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

const info = (id, msg, m) => log('info', id, msg, m);
const warn = (id, msg, m) => log('warn', id, msg, m);
const error = (id, msg, m) => log('error', id, msg, m);

// ─── Input validation ────────────────────────────────────────────────────────

/** @returns {{ cols: number, rows: number }} */
function clampDims(cols, rows) {
  return {
    cols: Math.max(1, Math.min(Math.floor(Number(cols)) || 120, MAX_COLS)),
    rows: Math.max(1, Math.min(Math.floor(Number(rows)) || 40, MAX_ROWS))
  };
}

/** Count sessions running a live shell, optionally excluding one id. */
function countRealShells(excludeId) {
  let n = 0;
  for (const s of activeSessions.values()) {
    if (s.id === excludeId) continue;
    if (s.ptyProcess && !s.processExited) n += 1;
  }
  return n;
}

/** @param {import('ws').WebSocket} ws @param {string} code @param {string} message @param {string|null} id */
function wsError(ws, code, message, id) {
  if (ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify({ type: 'error', code, message })); }
    catch (e) { error(id, 'WS send error failed', { code, err: e.message }); }
  }
}

/** Send a JSON message to a session's *current* ws if it is open. */
function sendToSession(session, payload) {
  const ws = session.ws;
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  try { ws.send(JSON.stringify(payload)); return true; }
  catch (e) { error(session.id, 'WS send failed', { err: e.message }); return false; }
}

// ─── Output ring buffer ──────────────────────────────────────────────────────

/** Append PTY output to the session ring, evicting from the head when capped. */
function bufferOutput(session, data) {
  session.outputBuffer += data;
  if (session.outputBuffer.length > RESUME_BUFFER_MAX) {
    // Keep only the tail beyond the cap so the most recent output survives.
    const over = session.outputBuffer.length - RESUME_BUFFER_MAX;
    session.outputBuffer = session.outputBuffer.slice(over);
  }
}

// ─── PTY helpers ────────────────────────────────────────────────────────────

/** @param {import('node-pty').IPty|undefined} ptyProcess @param {string} id */
function killPty(ptyProcess, id) {
  if (!ptyProcess || typeof ptyProcess.kill !== 'function') return;
  try { ptyProcess.kill('SIGTERM'); }
  catch (e) { warn(id, 'SIGTERM failed — already dead', { err: e.message }); return; }
  const timer = setTimeout(() => {
    try { if (ptyProcess && typeof ptyProcess.kill === 'function') ptyProcess.kill('SIGKILL'); }
    catch (_) {}
  }, KILL_GRACE_MS);
  if (typeof ptyProcess.once === 'function') ptyProcess.once('exit', () => clearTimeout(timer));
}

// ─── Session lifecycle ───────────────────────────────────────────────────────

/** Clear the resume grace timer for a session, if any. */
function clearGraceTimer(session) {
  const gt = graceTimers.get(session.id);
  if (gt) { clearTimeout(gt); graceTimers.delete(session.id); }
}

function cleanupSession(session) {
  const { id, ptyProcess } = session;
  info(id, 'Cleaning up session');

  session.voice = null;
  clearGraceTimer(session);

  const pt = pingTimers.get(id);
  clearInterval(pt);
  pingTimers.delete(id);
  const po = pongTimers.get(id);
  clearTimeout(po);
  pongTimers.delete(id);

  if (ptyProcess) { killPty(ptyProcess, id); session.ptyProcess = undefined; }
  activeSessions.delete(id);
  info(id, 'Session cleaned up');
}

/** @param {Session} session */
function startHeartbeat(session) {
  const { id } = session;
  // Replace any prior interval for this session.
  clearInterval(pingTimers.get(id));

  const t = setInterval(() => {
    const s = activeSessions.get(id);
    if (!s || !s.ws || s.ws.readyState !== WebSocket.OPEN) { clearInterval(t); pingTimers.delete(id); return; }
    try { s.ws.ping(); }
    catch (_) { clearInterval(t); return; }
    const po = setTimeout(() => {
      warn(id, 'Pong missed — closing stale session');
      if (s.ws) s.ws.terminate();
    }, PONG_TIMEOUT_MS);
    pongTimers.set(id, po);
  }, PING_INTERVAL_MS);
  pingTimers.set(id, t);
}

/** Stop the heartbeat ping interval for a session (used when detaching). */
function stopHeartbeat(session) {
  const { id } = session;
  clearInterval(pingTimers.get(id));  pingTimers.delete(id);
  clearTimeout(pongTimers.get(id));  pongTimers.delete(id);
}

// ─── PTY event wiring ──────────────────────────────────────────────────────

/**
 * Attach PTY data/exit/error handlers to a session. The data handler reads
 * `session.ws` dynamically so a re-attached WebSocket (resume) receives output
 * without rewiring.
 * @param {import('node-pty').IPty} ptyProcess
 * @param {Session} session
 */
function wirePtyToSession(ptyProcess, session) {
  const { id } = session;

  ptyProcess.onData((data) => {
    // Always buffer so a subsequent resume can replay this output.
    bufferOutput(session, data);
    if (!session.sessionActive) return;
    sendToSession(session, { type: 'output', data });
  });

  ptyProcess.once('exit', (code) => {
    if (session.processExited) return;
    session.processExited = true;

    const ranFor = session.startedAt ? Date.now() - session.startedAt : Infinity;
    session.rapidExits = ranFor < RAPID_EXIT_MS ? (session.rapidExits || 0) + 1 : 0;
    info(id, 'Shell exited', { code, ranForMs: ranFor, rapidExits: session.rapidExits });

    // If detached when the shell exits, there is nobody to receive a respawn —
    // tear the session down.
    if (!session.ws || session.ws.readyState !== WebSocket.OPEN) {
      cleanupSession(session);
      return;
    }
    if (!session.sessionActive) { cleanupSession(session); return; }

    // Stop rather than loop. Say what happened and what to check.
    if (session.rapidExits >= MAX_RAPID_RESPAWNS) {
      wsError(session.ws, 'SHELL_WILL_NOT_START',
        'The shell exited immediately ' + session.rapidExits + ' times in a row, so it was '
        + 'not restarted again. Check $SHELL (currently ' + resolveShell()
        + ') and your shell profile.', id);
      cleanupSession(session);
      return;
    }

    try { session.ws.send(JSON.stringify({ type: 'shell-reset', code: code || 0 })); }
    catch (_) {}

    const delay = Math.min(RESPAWN_BASE_MS * Math.pow(2, session.rapidExits), RESPAWN_MAX_MS);
    setTimeout(() => {
      if (session.sessionActive && session.ws && session.ws.readyState === WebSocket.OPEN) {
        spawnShell(session, session.shellCwd);
      } else {
        cleanupSession(session);
      }
    }, delay);
  });

  ptyProcess.on('error', (err) => {
    error(id, 'PTY error', { err: err.message || String(err) });
    if (session.ws) wsError(session.ws, 'PROCESS_ERROR', `Process error: ${err.message || String(err)}`, id);
    cleanupSession(session);
  });
}

// ─── Shell spawn helper ─────────────────────────────────────────────────────

/**
 * Spawn the user's default shell into the session and wire it up.
 * @param {Session} session
 * @param {string} [cwd]
 */
function spawnShell(session, cwd) {
  const { id } = session;
  const cols = session.lastCols || 120;
  const rows = session.lastRows || 40;

  let workingDir = cwd || process.env.HOME || os.homedir();
  if (!fs.existsSync(workingDir)) workingDir = os.homedir();

  const launch = policy ? policy.launch(session, cwd) : null;
  if (launch) workingDir = launch.cwd;
  const ptyEnv = launch ? launch.env : { ...process.env, TERM: 'xterm-256color' };
  const shell = launch ? launch.command : resolveShell();

  session.shellCwd = workingDir;

  let ptyProcess;
  try {
    ptyProcess = pty.spawn(shell, launch ? launch.args : ['-l'], { name: 'xterm-256color', cols, rows, cwd: workingDir, env: ptyEnv });
  } catch (e) {
    error(id, 'shell spawn failed', { err: e.message });
    return;
  }

  session.ptyProcess = ptyProcess;
  session.processExited = false;
  session.startedAt = Date.now();
  activeSessions.set(id, session);
  wirePtyToSession(ptyProcess, session);
  if (launch && launch.initialInput) ptyProcess.write(launch.initialInput);

  // Deliver anything typed while this shell did not yet exist.
  if (session.pendingInput) {
    const queued = session.pendingInput;
    session.pendingInput = '';
    try { ptyProcess.write(queued); }
    catch (e) { error(id, 'pending input flush failed', { err: e.message }); }
  }
}

// ─── Resume: re-attach a new WebSocket to an existing session ────────────────

/**
 * Re-attach `ws` onto an existing resumable session, replay buffered output,
 * and resume live delivery.
 *
 * Handlers are bound to the WebSocket once at connect time and read the active
 * session through `ws.__sessionRef` (a mutable property). On resume we simply
 * re-point that property at the target session — no second set of listeners is
 * registered, so there is no double-dispatch.
 * @param {Session} target
 * @param {import('ws').WebSocket} ws
 * @param {{ cols: number, rows: number }} dims
 * @param {Session} placeholder  The throwaway connection session to retire.
 */
function resumeSession(target, ws, dims, placeholder) {
  const { id } = target;
  const bufferedBytes = target.outputBuffer ? target.outputBuffer.length : 0;

  // Retire the placeholder connection session (the one created at connect).
  activeSessions.delete(placeholder.id);
  stopHeartbeat(placeholder);

  // Adopt the new connection onto the target session.
  target.ws = ws;
  target.sessionActive = true;
  ws.__sessionRef = target; // re-point handlers at the resumed session

  // Cancel the resume grace countdown — we're live again.
  clearGraceTimer(target);

  // Resize the live PTY to the new client viewport.
  target.lastCols = dims.cols;
  target.lastRows = dims.rows;
  if (target.ptyProcess && !target.processExited) {
    try { target.ptyProcess.resize(dims.cols, dims.rows); }
    catch (e) { warn(id, 'resume resize failed', { err: e.message }); }
  }

  // Restart heartbeat for the new socket.
  startHeartbeat(target);

  // Acknowledge resume, then replay buffered output into the fresh terminal.
  sendToSession(target, {
    type: 'ready',
    sessionId: id,
    command: target.command || resolveShell(),
    cwd: target.shellCwd,
    resumed: true
  });

  if (target.outputBuffer) {
    const buf = target.outputBuffer;
    target.outputBuffer = '';
    // Send in chunks to avoid a single oversized WS frame.
    const CHUNK = 16 * 1024;
    for (let i = 0; i < buf.length; i += CHUNK) {
      sendToSession(target, { type: 'output', data: buf.slice(i, i + CHUNK) });
    }
  }

  info(id, 'Session resumed', { bufferedBytes });
}

// ─── Speech-to-text helpers ─────────────────────────────────────────────────

function voiceError(session, code, message) {
  sendToSession(session, { type: 'voice-error', code, message });
}

function extForMime(mimeType) {
  const mt = String(mimeType || '').toLowerCase();
  if (mt.includes('wav')) return 'wav';
  if (mt.includes('mp4') || mt.includes('aac') || mt.includes('m4a')) return 'm4a';
  if (mt.includes('ogg')) return 'ogg';
  return 'webm';
}

function defaultVoiceConfig() {
  return {
    command: process.env.TERMINALONE_STT_BIN || 'whisper',
    model: process.env.TERMINALONE_STT_MODEL || 'tiny.en',
    language: process.env.TERMINALONE_STT_LANGUAGE || 'en',
    args: VOICE_DEFAULT_ARGS
  };
}

function readVoiceConfig() {
  const config = defaultVoiceConfig();
  // Explicit deployment or test environment wins over the saved UI setting.
  if (process.env.TERMINALONE_STT_BIN || process.env.TERMINALONE_STT_MODEL || process.env.TERMINALONE_STT_LANGUAGE) {
    return config;
  }
  let raw;
  try { raw = fs.readFileSync(VOICE_CONFIG_PATH, 'utf8'); }
  catch (_) { return config; }
  let saved;
  try { saved = JSON.parse(raw); }
  catch (_) { return config; }
  if (!saved || typeof saved !== 'object') return config;
  for (const key of ['command', 'model', 'language', 'args']) {
    if (typeof saved[key] === 'string') config[key] = saved[key];
  }
  return config;
}

function validateVoiceConfig(input) {
  const source = input && typeof input === 'object' ? input : {};
  const command = typeof source.command === 'string' ? source.command.trim() : '';
  if (!command) return { ok: false, error: 'command must not be empty' };
  if (/[\u0000-\u001f\u007f]/.test(command)) return { ok: false, error: 'command must not contain NUL, newline, or control characters' };

  const model = typeof source.model === 'string' ? source.model.trim() : '';
  if (!model) return { ok: false, error: 'model must not be empty' };
  if (/[\u0000-\u001f\u007f]/.test(model)) return { ok: false, error: 'model must not contain NUL, newline, or control characters' };

  const language = typeof source.language === 'string' ? source.language.trim().toLowerCase() : '';
  if (!/^(?:[a-z]{2,3}|auto)$/.test(language)) return { ok: false, error: 'language must be a two- or three-letter code, or auto' };

  const args = typeof source.args === 'string' ? source.args.trim() : '';
  if (!args) return { ok: false, error: 'args must not be empty' };
  if (args.includes('\u0000')) return { ok: false, error: 'args must not contain NUL characters' };
  if (!args.includes('{audio}')) return { ok: false, error: 'args must contain {audio}' };
  const unknown = [...args.matchAll(/\{([^{}]*)\}/g)]
    .map((match) => match[1])
    .filter((name) => !VOICE_PLACEHOLDERS.has(name));
  if (unknown.length) return { ok: false, error: `unknown placeholder {${unknown[0]}}` };

  return { ok: true, value: { command, model, language, args } };
}

function writeVoiceConfig(config) {
  fs.mkdirSync(path.dirname(VOICE_CONFIG_PATH), { recursive: true, mode: 0o700 });
  const body = JSON.stringify({
    command: config.command,
    model: config.model,
    language: config.language,
    args: config.args
  }, null, 2) + '\n';
  fs.writeFileSync(VOICE_CONFIG_PATH, body, { mode: 0o600 });
  try { fs.chmodSync(VOICE_CONFIG_PATH, 0o600); } catch (_) {}
}

function resolveVoiceCommand(command) {
  if (typeof command !== 'string' || !command) return { commandFound: false, commandPath: null };
  if (command.includes('/')) {
    const candidate = path.isAbsolute(command) ? command : path.resolve(command);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return { commandFound: true, commandPath: candidate };
    } catch (_) {
      return { commandFound: false, commandPath: null };
    }
  }
  for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, command);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return { commandFound: true, commandPath: candidate };
    } catch (_) {}
  }
  return { commandFound: false, commandPath: null };
}

function voiceSettingsPayload() {
  const config = readVoiceConfig();
  return { ...config, resolved: resolveVoiceCommand(config.command) };
}

function buildVoiceArgs(config, values) {
  return config.args
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.replace(/\{(audio|model|language|dir|base|output)\}/g, (_, key) => values[key]));
}

function cleanupTempDir(dir) {
  if (!dir) return;
  const absolute = path.resolve(dir);
  const allowed = [path.resolve(VOICE_TMP_BASE), path.resolve(os.tmpdir())];
  if (!allowed.some((base) => absolute.startsWith(base + path.sep))) return;
  fs.rm(dir, { recursive: true, force: true }, () => {});
}

function transcriptFromSrt(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^\d+$/.test(line) && !line.includes('-->'))
    .join('\n')
    .trim();
}

function readTranscriptText(tmpDir, base, cb) {
  const txtPath = path.join(tmpDir, `${base}.txt`);
  fs.readFile(txtPath, 'utf8', (err, text) => {
    if (!err) { cb(null, text); return; }
    if (err.code !== 'ENOENT') { cb(err); return; }
    fs.readFile(path.join(tmpDir, `${base}.srt`), 'utf8', (srtErr, srt) => {
      if (srtErr) { cb(srtErr); return; }
      cb(null, transcriptFromSrt(srt));
    });
  });
}

function transcribeAudioFile(session, audioPath, tmpDir) {
  const checked = validateVoiceConfig(readVoiceConfig());
  if (!checked.ok) {
    warn(session.id, 'Voice settings are invalid', { error: checked.error });
    voiceError(session, 'STT_FAILED', `Voice settings are invalid: ${checked.error}`);
    cleanupTempDir(tmpDir);
    return;
  }
  const config = checked.value;
  const base = path.basename(audioPath, path.extname(audioPath));
  const args = buildVoiceArgs(config, {
    audio: audioPath,
    model: config.model,
    language: config.language,
    dir: tmpDir,
    base,
    output: path.join(tmpDir, `${base}.txt`)
  });

  info(session.id, 'Starting local STT transcription', {
    command: config.command, model: config.model, language: config.language
  });
  const child = spawn(config.command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  let settled = false;
  const timer = setTimeout(() => {
    settled = true;
    child.kill('SIGTERM');
    voiceError(session, 'STT_TIMEOUT', 'Speech transcription timed out');
    cleanupTempDir(tmpDir);
  }, STT_TIMEOUT_MS);

  child.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk.toString()).slice(-4000);
  });
  child.on('error', (err) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    const code = err.code === 'ENOENT' ? 'STT_UNAVAILABLE' : 'STT_ERROR';
    voiceError(session, code, err.code === 'ENOENT' ? 'Local whisper command not found' : err.message);
    cleanupTempDir(tmpDir);
  });
  child.on('exit', (code) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (code !== 0) {
      warn(session.id, 'Local STT failed', { code, stderr });
      voiceError(session, 'STT_FAILED', 'Speech transcription failed');
      cleanupTempDir(tmpDir);
      return;
    }
    readTranscriptText(tmpDir, base, (readErr, text) => {
      cleanupTempDir(tmpDir);
      if (readErr) {
        voiceError(session, 'STT_NO_TRANSCRIPT', 'Speech transcription produced no text');
        return;
      }
      const transcript = String(text || '').trim();
      if (!transcript) {
        voiceError(session, 'STT_NO_TRANSCRIPT', 'Speech transcription produced no text');
        return;
      }
      sendToSession(session, { type: 'voice-transcript', text: transcript });
      info(session.id, 'Local STT transcript ready', { chars: transcript.length });
    });
  });
}

function finalizeVoice(session) {
  const voice = session.voice;
  session.voice = null;
  if (!voice || !voice.chunks.length || voice.bytes <= 0) {
    voiceError(session, 'VOICE_EMPTY', 'No voice audio was captured');
    return;
  }

  let tmpDir;
  try {
    fs.mkdirSync(VOICE_TMP_BASE, { recursive: true, mode: 0o700 });
    tmpDir = fs.mkdtempSync(path.join(VOICE_TMP_BASE, 'stt-'));
  } catch (err) {
    voiceError(session, 'VOICE_WRITE_FAILED', 'Could not create a voice transcription folder');
    return;
  }
  const audioPath = path.join(tmpDir, `utterance.${extForMime(voice.mimeType)}`);
  fs.writeFile(audioPath, Buffer.concat(voice.chunks), (err) => {
    if (err) {
      voiceError(session, 'VOICE_WRITE_FAILED', 'Could not save voice audio for transcription');
      cleanupTempDir(tmpDir);
      return;
    }
    transcribeAudioFile(session, audioPath, tmpDir);
  });
}

// ─── Message dispatcher ─────────────────────────────────────────────────────

/** @param {Session} session @param {import('ws').WebSocket} ws @param {object} data */
function handleMessage(session, ws, data) {
  if (!session.sessionActive && data.type !== 'resume' && data.type !== 'shell') return;

  switch (data.type) {
    case 'shell': {
      if (session.ptyProcess && !session.processExited) {
        try { session.ptyProcess.kill(); } catch (_) {}
      }
      const { cols, rows } = clampDims(data.cols, data.rows);
      session.lastCols = cols;
      session.lastRows = rows;
      // Enforce the concurrent-shell cap. Fresh spawns only — resume reuses an
      // existing session and is exempt. The current (placeholder) session has no
      // PTY yet and is excluded from the count.
      if (countRealShells(session.id) >= MAX_CONCURRENT_SESSIONS) {
        wsError(ws, 'SESSION_LIMIT', 'Maximum concurrent sessions reached', session.id);
        break;
      }
      try {
        if (policy) policy.select(session, data);
        spawnShell(session, data.cwd || process.env.HOME || os.homedir());
      } catch (e) {
        wsError(ws, 'LAUNCH_DENIED', e.message, session.id);
        break;
      }
      if (!session.ptyProcess) { wsError(ws, 'SPAWN_FAILED', 'Could not start terminal', session.id); break; }
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ready', sessionId: session.id, command: resolveShell(), cwd: session.shellCwd }));
      }
      break;
    }
    case 'resume': {
      // Look up the requested session and adopt it onto this connection.
      const targetId = String(data.sessionId || '');
      const target = activeSessions.get(targetId);
      if (target && target.ptyProcess && !target.processExited &&
          (!policy || policy.canResume(session, target, data))) {
        resumeSession(target, ws, clampDims(data.cols, data.rows), session);
      } else {
        info(session.id, 'Resume failed — target not resumable', { targetId });
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resume-failed', sessionId: targetId, reason: 'not-found' }));
        }
      }
      break;
    }
    case 'input': {
      if (typeof data.data !== 'string') break;
      if (session.ptyProcess && !session.processExited) {
        try { session.ptyProcess.write(data.data); }
        catch (e) { wsError(ws, 'WRITE_FAILED', `Write failed: ${e.message}`, session.id); }
      } else {
        // No shell yet: keep the keys rather than throwing them away.
        const queued = (session.pendingInput || '') + data.data;
        session.pendingInput = queued.length > MAX_PENDING_INPUT
          ? queued.slice(-MAX_PENDING_INPUT)
          : queued;
      }
      break;
    }
    case 'voice-start': {
      session.voice = {
        chunks: [],
        bytes: 0,
        mimeType: typeof data.mimeType === 'string' ? data.mimeType.slice(0, 80) : '',
        startedAt: Date.now()
      };
      sendToSession(session, { type: 'voice-ready' });
      break;
    }
    case 'voice-chunk': {
      if (!session.voice) {
        voiceError(session, 'VOICE_NOT_STARTED', 'Voice input was not started');
        break;
      }
      if (typeof data.b64 !== 'string' || data.b64.length === 0) {
        voiceError(session, 'VOICE_BAD_CHUNK', 'Voice chunk was empty or invalid');
        break;
      }
      let chunk;
      try { chunk = Buffer.from(data.b64, 'base64'); }
      catch (_) { chunk = Buffer.alloc(0); }
      if (!chunk.length) {
        voiceError(session, 'VOICE_BAD_CHUNK', 'Voice chunk could not be decoded');
        break;
      }
      if (chunk.length > STT_MAX_CHUNK_BYTES) {
        session.voice = null;
        voiceError(session, 'VOICE_CHUNK_TOO_LARGE', 'Voice chunk exceeded the size limit');
        break;
      }
      if (session.voice.bytes + chunk.length > STT_MAX_UTTERANCE_BYTES) {
        session.voice = null;
        voiceError(session, 'VOICE_TOO_LARGE', 'Voice utterance exceeded the size limit');
        break;
      }
      session.voice.chunks.push(chunk);
      session.voice.bytes += chunk.length;
      break;
    }
    case 'voice-end': {
      finalizeVoice(session);
      break;
    }
    case 'resize': {
      const { cols, rows } = clampDims(data.cols, data.rows);
      session.lastCols = cols;
      session.lastRows = rows;
      if (session.ptyProcess && !session.processExited) {
        try { session.ptyProcess.resize(cols, rows); }
        catch (e) { wsError(ws, 'RESIZE_FAILED', `Resize failed: ${e.message}`, session.id); }
      }
      break;
    }
    case 'close': {
      // Explicit user-initiated close → full teardown of this session.
      session.userClosed = true;
      if (session.ptyProcess && !session.processExited) cleanupSession(session);
      break;
    }
    case 'ping': {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'pong', ts: data.ts }));
      }
      break;
    }
    case 'pong': {
      clearTimeout(pongTimers.get(session.id));
      pongTimers.delete(session.id);
      break;
    }
    default: wsError(ws, 'UNKNOWN_MESSAGE', `Unknown message type: ${data.type}`, session.id);
  }
}

// ─── WS event binding ───────────────────────────────────────────────────────

/**
 * Bind a freshly-connected WS onto a session. Handlers read the active session
 * through `ws.__sessionRef`, so a resume that re-points that property needs no
 * re-registration (and therefore cannot double-dispatch).
 * @param {import('ws').WebSocket} ws
 * @param {Session} session
 */
function bindWsToSession(ws, session) {
  ws.__sessionRef = session;

  const remoteAddr = ws._socket?.remoteAddress || null;
  info(session.id, 'WebSocket connected', { ip: remoteAddr });

  ws.on('message', (message) => {
    const s = ws.__sessionRef;
    if (!s || s.ws !== ws) return;
    try { handleMessage(s, ws, JSON.parse(message)); }
    catch (err) { error(s.id, 'Failed to parse WS message', { err: err.message }); wsError(ws, 'PARSE_ERROR', 'Malformed JSON message', s.id); }
  });

  ws.on('pong', () => {
    const s = ws.__sessionRef;
    if (!s) return;
    clearTimeout(pongTimers.get(s.id));
    pongTimers.delete(s.id);
  });

  ws.on('close', (code, reason) => {
    const s = ws.__sessionRef;
    if (!s || s.ws !== ws) return;
    info(s.id, 'WebSocket disconnected', { code, reason: reason?.toString?.() || '', userClosed: !!s.userClosed });

    // Explicit close already cleaned up the session; ensure the placeholder is gone.
    if (s.userClosed) {
      activeSessions.delete(s.id);
      return;
    }
    // Unexpected drop: keep the PTY alive and start the resume grace window.
    if (s.ptyProcess && !s.processExited) {
      s.ws = null;
      s.sessionActive = false;
      stopHeartbeat(s);
      if (!graceTimers.has(s.id)) {
        info(s.id, 'Session entering resume grace', { graceMs: RESUME_GRACE_MS });
        const gt = setTimeout(() => {
          warn(s.id, 'Resume grace expired — cleaning up detached session');
          cleanupSession(s);
        }, RESUME_GRACE_MS);
        graceTimers.set(s.id, gt);
      }
    } else {
      // No live PTY to preserve — just drop the placeholder.
      activeSessions.delete(s.id);
    }
  });

  ws.on('error', (err) => {
    const s = ws.__sessionRef;
    error(s ? s.id : null, 'WebSocket error', { err: err.message || String(err) });
    // An error does not necessarily kill the socket; mark inactive and let the
    // close handler decide grace vs cleanup.
    if (s) s.sessionActive = false;
  });
}

// ─── Express app ────────────────────────────────────────────────────────────

const app = express();
if (policy) app.use((req, res, next) => {
  try { req.terminalPrincipal = policy.authenticate(req); }
  catch (_) { return res.status(403).json({ error: 'Use the authorized private Tailscale route.' }); }
  next();
});
app.use((req, res, next) => {
  if (!requestAllowed(req)) return res.status(403).json({ error: 'This address or request origin is not allowed. Use the local address or a configured authenticated HTTPS proxy.' });
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
  next();
});
app.use(express.json({ limit: '64kb' }));
// App assets are served with no-store so the browser always runs the latest
// frontend (critical during input/dictation iteration — a cached input-guard.mjs
// silently reproduces already-fixed echo bugs).
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-store'),
}));
app.use('/node_modules', express.static(path.join(__dirname, '..', 'node_modules')));

app.get('/health', (req, res) => { res.json({ status: 'ok', sessions: activeSessions.size }); });
app.get('/session-profile', (req, res) => {
  if (!policy) return res.json({ requireDirectory: false });
  try { res.json(policy.profile(req)); }
  catch (_) { res.status(400).json({ error: 'Unknown tool profile' }); }
});
app.get('/api/voice/settings', (req, res) => {
  res.json(voiceSettingsPayload());
});
app.put('/api/voice/settings', (req, res) => {
  const checked = validateVoiceConfig(req.body || {});
  if (!checked.ok) { res.status(400).json({ error: checked.error }); return; }
  try {
    writeVoiceConfig(checked.value);
  } catch (err) {
    error(null, 'Could not save voice settings', { err: err.message });
    res.status(500).json({ error: `Could not save voice settings: ${err.message}` });
    return;
  }
  res.json({ ...checked.value, resolved: resolveVoiceCommand(checked.value.command) });
});
app.get('/admin/sessions', (req, res) => {
  const sessions = Array.from(activeSessions.values()).filter((s) => !policy || s.owner === req.terminalPrincipal).map((s) => {
    const resumable = !s.ws && !!s.ptyProcess && !s.processExited && graceTimers.has(s.id);
    return {
      id: s.id, command: s.command || resolveShell(),
      startedAt: s.startedAt || null, durationMs: s.startedAt ? Date.now() - s.startedAt : null,
      processExited: s.processExited,
      attached: !!s.ws,
      resumable,
      bufferedBytes: s.outputBuffer ? s.outputBuffer.length : 0
    };
  });
  const resumableCount = sessions.filter((s) => s.resumable).length;
  res.json({ active: sessions.length, max: MAX_CONCURRENT_SESSIONS, resumableCount, sessions });
});
app.post('/admin/sessions/:id/kill', (req, res) => {
  const s = activeSessions.get(req.params.id);
  if (!s || (policy && s.owner !== req.terminalPrincipal)) { res.status(404).json({ error: 'Session not found' }); return; }
  if (policy && !policy.validOrigin(req)) { res.status(403).json({ error: 'Origin denied' }); return; }
  cleanupSession(s);
  res.json({ ok: true, id: req.params.id });
});

// ─── HTTP + WebSocket server ────────────────────────────────────────────────

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, verifyClient: (info, done) => {
  const req = info.req;
  if (!requestAllowed(req)) return done(false, 403, 'This address or request origin is not allowed');
  if (!policy) return done(true);
  try {
    req.terminalPrincipal = policy.authenticate(req);
    if (!policy.validOrigin(req)) throw new Error('Origin denied');
    done(true);
  } catch (_) { done(false, 403, 'Use the authorized private Tailscale route'); }
} });

wss.on('connection', (ws, req) => {
  // Each connection starts as a fresh placeholder session. It becomes "real"
  // when the client sends `shell`, or it adopts an existing session via `resume`.
  const sessionId = uuidv4();
  /** @type {Session} */
  const session = {
    id: sessionId,
    owner: req.terminalPrincipal || null,
    toolId: null,
    command: null,
    ptyProcess: undefined,
    sessionActive: true,
    processExited: false,
    ws,
    startedAt: Date.now(),
    outputBuffer: '',
    userClosed: false
  };
  activeSessions.set(sessionId, session);

  bindWsToSession(ws, session);
  startHeartbeat(session);
});

// ─── Graceful shutdown ─────────────────────────────────────────────────────

/** @param {string} signal */
async function shutdown(signal) {
  info(null, `Received ${signal}, starting graceful shutdown`, { activeSessions: activeSessions.size });
  server.close();
  const promises = Array.from(activeSessions.values()).map((s) => {
    clearGraceTimer(s);
    if (s.ptyProcess) killPty(s.ptyProcess, s.id);
    activeSessions.delete(s.id);
    return new Promise((r) => setTimeout(r, KILL_GRACE_MS + 100));
  });
  await Promise.race([Promise.all(promises), new Promise((r) => setTimeout(r, 5_000))]);
  info(null, 'Shutdown complete', { activeSessions: activeSessions.size });
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

if (SOCKET_PATH && fs.existsSync(SOCKET_PATH)) {
  throw new Error('Socket already exists; refusing to replace an existing listener');
}
server.listen(SOCKET_PATH || { port: PORT, host: HOST }, () => {
  if (SOCKET_PATH) fs.chmodSync(SOCKET_PATH, 0o600);
  info(null, SOCKET_PATH ? 'TerminalOne listening on private Unix socket' : `TerminalOne running at http://${HOST}:${PORT}`, { maxSessions: MAX_CONCURRENT_SESSIONS });
});
