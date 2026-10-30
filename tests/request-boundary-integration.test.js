const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const WebSocket = require('ws');

const port = Number(process.env.BOUNDARY_PORT || 11006);
const origin = 'https://terminal.example.com';

function request(headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: '/health', headers }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.setTimeout(1000, () => req.destroy(new Error('health request timed out')));
  });
}

test('configured HTTPS proxy headers work through real HTTP, WebSocket and shell input', { timeout: 30000 }, async (t) => {
  const server = spawn(process.execPath, [path.join(__dirname, '../src/server.js')], {
    env: { ...process.env, PORT: String(port), SHELL: '/bin/bash', TERMINALONE_TRUSTED_ORIGINS: origin },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '';
  server.stdout.on('data', (data) => { log += data; });
  server.stderr.on('data', (data) => { log += data; });
  t.after(async () => {
    if (server.exitCode !== null) return;
    const exited = new Promise((resolve) => server.once('exit', resolve));
    server.kill('SIGTERM');
    await exited;
  });
  const deadline = Date.now() + 15000;
  for (;;) {
    try { if (await request() === 200) break; } catch { /* still starting */ }
    assert.equal(server.exitCode, null, log);
    assert.ok(Date.now() < deadline, 'server did not become healthy: ' + log);
    await delay(100);
  }
  assert.equal(await request({ Host: 'terminal.example.com', Origin: origin }), 200);
  assert.equal(await request({ Host: 'evil.example.com', Origin: 'https://evil.example.com' }), 403);
  assert.equal(await request({ Host: 'terminal.example.com', Origin: 'https://evil.example.com' }), 403);

  for (const rejectedOrigin of ['https://evil.example.com', 'http://terminal.example.com']) {
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { Host: 'terminal.example.com', Origin: rejectedOrigin } });
      ws.on('error', reject);
      ws.on('open', () => { ws.close(); reject(new Error('untrusted WebSocket accepted')); });
      ws.on('unexpected-response', (_, res) => {
        res.resume();
        try { assert.equal(res.statusCode, 401); resolve(); } catch (err) { reject(err); }
      });
    });
  }
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { Host: 'terminal.example.com', Origin: origin } });
    const timer = setTimeout(() => { ws.terminate(); reject(new Error('proxy shell did not respond: ' + log)); }, 10000);
    t.after(() => { clearTimeout(timer); ws.terminate(); });
    let output = '';
    ws.on('error', reject);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'shell', cols: 80, rows: 24 })));
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw);
      if (msg.type === 'ready') ws.send(JSON.stringify({ type: 'input', data: "printf 'REMOTE_%s\\n' 'BOUNDARY_OK'\r" }));
      if (msg.type === 'error') reject(new Error(msg.message));
      if (msg.type === 'output') output += msg.data;
      if (output.includes('REMOTE_BOUNDARY_OK')) {
        clearTimeout(timer);
        ws.send(JSON.stringify({ type: 'close' }));
        ws.close();
        resolve();
      }
    });
  });
});
