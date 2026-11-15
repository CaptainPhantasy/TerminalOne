#!/usr/bin/env node
'use strict';

// Verifies the optional Linux/private-deployment features:
//   - a Unix-socket listener with mode 0600 and cleanup on shutdown
//   - an optional policy module supplying authentication and a session profile
//   - refusal to bind a non-loopback TCP address without a policy
//   - refusal to replace an existing socket

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SERVER = path.join(ROOT, 'src', 'server.js');
const NODE = process.execPath;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 't1-linux-'));
const SOCKET = path.join(TMP, 'terminalone.sock');
const POLICY = path.join(TMP, 'policy.js');
const STALE = path.join(TMP, 'stale.sock');

const POLICY_SOURCE = `'use strict';
const os = require('os');
module.exports = {
  authenticate() { return 'test-owner'; },
  validOrigin() { return true; },
  profile() { return { requireDirectory: true, name: 'test-profile' }; },
  select(session) { session.owner = 'test-owner'; },
  launch(session, cwd) {
    return {
      command: process.env.SHELL || '/bin/sh',
      args: ['-l'],
      env: { ...process.env, TERM: 'xterm-256color' },
      cwd: cwd || process.env.HOME || os.homedir(),
    };
  },
  canResume() { return true; },
};
`;

function request(socketPath, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ socketPath, path: urlPath, method: 'GET', timeout: 5000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('timeout', () => req.destroy(new Error('request timed out')));
    req.on('error', reject);
    req.end();
  });
}

async function waitForHealth(socketPath, timeoutMs = 15000) {
  const started = Date.now();
  for (;;) {
    try {
      const res = await request(socketPath, '/health');
      if (res.status === 200) return res;
    } catch (_) { /* listener not ready */ }
    if (Date.now() - started > timeoutMs) throw new Error('server did not become healthy on ' + socketPath);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

function startServer(env, stderr = false) {
  return spawn(NODE, [SERVER], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'ignore', stderr ? 'pipe' : 'ignore'],
  });
}

function waitForExit(child, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null) { resolve({ code: child.exitCode, signal: child.signalCode }); return; }
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('process did not exit within ' + timeoutMs + 'ms'));
    }, timeoutMs);
    child.once('exit', (code, signal) => { clearTimeout(timer); resolve({ code, signal }); });
  });
}

async function stopServer(child) {
  if (child.exitCode !== null) return { code: child.exitCode, signal: child.signalCode };
  child.kill('SIGTERM');
  return waitForExit(child);
}

async function expectStartupFailure(env, pattern) {
  const child = startServer(env, true);
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const result = await waitForExit(child);
  assert.strictEqual(result.code, 1, 'expected startup to exit with code 1, got ' + JSON.stringify(result));
  assert(pattern.test(stderr), 'expected stderr to match ' + pattern + ', got: ' + stderr.trim());
  return stderr;
}

async function main() {
  fs.writeFileSync(POLICY, POLICY_SOURCE);
  fs.writeFileSync(STALE, 'not a live listener');

  let server = null;
  try {
    server = startServer({
      TERMINALONE_SOCKET: SOCKET,
      TERMINALONE_POLICY_MODULE: POLICY,
      SHELL: process.env.SHELL || '/bin/sh',
    });
    await waitForHealth(SOCKET);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const mode = fs.statSync(SOCKET).mode & 0o777;
    assert.strictEqual(mode, 0o600, 'socket mode should be 0600, got ' + mode.toString(8));
    console.log('  ✓ Unix socket created with mode 0600');

    const health = JSON.parse((await request(SOCKET, '/health')).body);
    assert.strictEqual(health.status, 'ok');
    console.log('  ✓ health responds over the Unix socket');

    const profile = await request(SOCKET, '/session-profile');
    assert.strictEqual(profile.status, 200);
    assert.deepStrictEqual(JSON.parse(profile.body), { requireDirectory: true, name: 'test-profile' });
    console.log('  ✓ policy module supplies /session-profile');

    const sessions = await request(SOCKET, '/admin/sessions');
    assert.strictEqual(sessions.status, 200);
    assert.strictEqual(JSON.parse(sessions.body).active, 0);
    console.log('  ✓ session listing is scoped to the policy principal');

    await stopServer(server);
    server = null;
    assert(!fs.existsSync(SOCKET), 'graceful shutdown should remove the socket');
    console.log('  ✓ graceful shutdown removes the socket');

    // A clean shutdown must allow a restart on the same path.
    server = startServer({
      TERMINALONE_SOCKET: SOCKET,
      TERMINALONE_POLICY_MODULE: POLICY,
      SHELL: process.env.SHELL || '/bin/sh',
    });
    await waitForHealth(SOCKET);
    await stopServer(server);
    server = null;
    console.log('  ✓ restart succeeds after a clean shutdown');

    await expectStartupFailure(
      { HOST: '0.0.0.0', TERMINALONE_SOCKET: '' },
      /Refusing to bind to a non-loopback address without TERMINALONE_POLICY_MODULE/
    );
    console.log('  ✓ non-loopback TCP without a policy is refused');

    await expectStartupFailure(
      { HOST: '127.0.0.1', TERMINALONE_SOCKET: STALE },
      /Socket already exists; refusing to replace an existing listener/
    );
    assert(fs.existsSync(STALE), 'stale socket refusal must not remove the existing file');
    console.log('  ✓ an existing socket is never replaced');

    console.log('\nAll Linux deployment checks passed!');
  } finally {
    if (server) {
      try { server.kill('SIGKILL'); } catch (_) { /* already gone */ }
    }
    fs.rmSync(TMP, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('\n✗ ' + (err && err.message ? err.message : err));
  process.exit(1);
});
