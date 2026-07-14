'use strict';

const fs = require('fs');
const path = require('path');
const { FloydApiError, FloydClient } = require('@floyd/sdk');

const RUNTIME_ROOT = process.env.FLOYD_RUNTIME_ROOT || '/Volumes/Storage/FLOYD_RUNTIME';
const WORKSTATION_ROOT = process.env.FLOYD_WORKSTATION_ROOT || '/Volumes/Storage/FLOYD_WORKSTATION';
const CORE_URL = process.env.FLOYD_CORE_URL || `http://127.0.0.1:${process.env.FLOYD_CORE_PORT || 41414}`;

function gatewayToken() {
  return fs.readFileSync(path.join(RUNTIME_ROOT, 'core', 'gateway.token'), 'utf8').trim();
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

/** Create a PTY-local Core CLI function without changing global shell files. */
function buildFloydShellCommand() {
  const cli = path.join(WORKSTATION_ROOT, 'clients', 'cli', 'src', 'main.ts');
  return `unalias floyd 2>/dev/null; floyd_core() { ${shellQuote(process.execPath)} ${shellQuote(cli)} "$@"; }; alias floyd=floyd_core; floyd_core status`;
}

function sendPayload(res, status, payload) {
  if (typeof payload === 'string') res.status(status).type('text/plain').send(payload);
  else res.status(status).json(payload);
}

/**
 * Relay only Core health through the server-side SDK. Request abort and response
 * close both cancel the outbound fetch; the gateway token stays server-side.
 */
async function forwardFloydHealth(req, res) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const abortOnClose = () => { if (!res.writableEnded) abort(); };
  req.once('aborted', abort);
  res.once('close', abortOnClose);

  try {
    const client = new FloydClient({ baseUrl: CORE_URL, token: gatewayToken });
    sendPayload(res, 200, await client.health(controller.signal));
  } catch (error) {
    if (controller.signal.aborted || res.writableEnded) return;
    if (error instanceof FloydApiError) {
      sendPayload(res, error.status, error.payload);
      return;
    }
    res.status(503).json({
      error: {
        type: 'floyd_core_unavailable',
        message: error instanceof Error ? error.message : String(error)
      }
    });
  } finally {
    req.off('aborted', abort);
    res.off('close', abortOnClose);
  }
}

module.exports = { buildFloydShellCommand, forwardFloydHealth };
