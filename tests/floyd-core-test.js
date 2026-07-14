#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const WebSocket = require('ws');

const TOKEN = 'test-gateway-token';

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function get(port, pathname) {
  return new Promise((resolve, reject) => {
    const request = http.get({ hostname: '127.0.0.1', port, path: pathname }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body }));
    });
    request.once('error', reject);
  });
}

async function waitForSurface(port) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      if ((await get(port, '/health')).status === 200) return;
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('TerminalOne did not become healthy');
}

async function run() {
  let mode = 'ok';
  let delayedStarted;
  let resolveDelayedStarted;
  let upstreamClosed = false;
  const fakeCore = http.createServer((request, response) => {
    assert.equal(request.headers.authorization, `Bearer ${TOKEN}`);
    assert.equal(request.url, '/api/health');
    if (mode === 'unauthorized') {
      response.writeHead(401, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { type: 'auth', message: 'exact upstream auth failure' } }));
      return;
    }
    if (mode === 'delay') {
      response.on('close', () => { upstreamClosed = true; });
      resolveDelayedStarted();
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok', engine: { healthy: true, name: 'fake-opencode' } }));
  });
  const corePort = await listen(fakeCore);

  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terminalone-floyd-test-'));
  fs.mkdirSync(path.join(runtimeRoot, 'core'));
  fs.writeFileSync(path.join(runtimeRoot, 'core', 'gateway.token'), TOKEN, { mode: 0o600 });

  const reservation = http.createServer();
  const surfacePort = await listen(reservation);
  await close(reservation);
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'server.js')], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(surfacePort),
      HOST: '127.0.0.1',
      FLOYD_CORE_URL: `http://127.0.0.1:${corePort}`,
      FLOYD_CORE_PORT: String(corePort),
      FLOYD_RUNTIME_ROOT: runtimeRoot,
      FLOYD_WORKSTATION_ROOT: '/Volumes/Storage/FLOYD_WORKSTATION'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk; });
  child.stderr.on('data', (chunk) => { logs += chunk; });

  try {
    await waitForSurface(surfacePort);
    const health = await get(surfacePort, '/api/floyd/health');
    assert.equal(health.status, 200);
    assert.deepEqual(JSON.parse(health.body), { status: 'ok', engine: { healthy: true, name: 'fake-opencode' } });

    mode = 'unauthorized';
    const denied = await get(surfacePort, '/api/floyd/health');
    assert.equal(denied.status, 401);
    assert.deepEqual(JSON.parse(denied.body), { error: { type: 'auth', message: 'exact upstream auth failure' } });

    mode = 'delay';
    delayedStarted = new Promise((resolve) => { resolveDelayedStarted = resolve; });
    const abandoned = http.get({ hostname: '127.0.0.1', port: surfacePort, path: '/api/floyd/health' });
    abandoned.on('error', () => {});
    await delayedStarted;
    abandoned.destroy();
    const abortDeadline = Date.now() + 2_000;
    while (!upstreamClosed && Date.now() < abortDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(upstreamClosed, true, 'client disconnect aborts the Core request');
    mode = 'ok';

    await new Promise((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${surfacePort}`);
      let ready = false;
      let acknowledged = false;
      let output = '';
      const timer = setTimeout(() => reject(new Error(`TerminalOne Floyd PTY timed out: ${output}`)), 15_000);
      socket.on('open', () => socket.send(JSON.stringify({ type: 'shell', cols: 100, rows: 30 })));
      socket.on('message', (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.type === 'ready' && !ready) {
          ready = true;
          socket.send(JSON.stringify({ type: 'floyd' }));
        } else if (message.type === 'floyd-ready') {
          acknowledged = true;
        } else if (message.type === 'output') {
          output += message.data;
        } else if (message.type === 'error') {
          clearTimeout(timer);
          reject(new Error(`${message.code}: ${message.message}`));
        }
        if (acknowledged && output.includes('fake-opencode')) {
          clearTimeout(timer);
          socket.send(JSON.stringify({ type: 'close' }));
          socket.close();
          resolve();
        }
      });
      socket.on('error', reject);
    });

    console.log('PASS TerminalOne Floyd Core SDK health, error, abort, and PTY checks');
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
    await close(fakeCore);
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
