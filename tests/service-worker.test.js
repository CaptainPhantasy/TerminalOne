const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function worker(fetchResponse) {
  const listeners = {};
  const stored = new Map();
  const key = (request) => typeof request === 'string' ? request : request.url;
  const cache = {
    match: async (request) => stored.get(key(request))?.clone(),
    put: async (request, response) => stored.set(key(request), response)
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/service-worker.js'), 'utf8'), {
    URL, Response,
    self: { location: { origin: 'https://terminal.example.com' }, addEventListener: (type, callback) => { listeners[type] = callback; } },
    caches: { open: async () => cache },
    fetch: fetchResponse
  });
  return {
    stored,
    request(pathname) {
      let response;
      listeners.fetch({ request: { method: 'GET', url: 'https://terminal.example.com' + pathname }, respondWith(promise) { response = promise; } });
      return response;
    }
  };
}

test('installed apps receive current HTML instead of an old cached input binding', async () => {
  const app = worker(async () => new Response('current app'));
  app.stored.set('https://terminal.example.com/', new Response('old app'));
  assert.equal(await (await app.request('/')).text(), 'current app');
});
test('offline input module falls back to its own cached module', async () => {
  const app = worker(async () => { throw new Error('offline'); });
  app.stored.set('https://terminal.example.com/input-guard.mjs', new Response('export class InputGuard {}'));
  assert.equal(await (await app.request('/input-guard.mjs')).text(), 'export class InputGuard {}');
  assert.equal((await app.request('/manifest.json')).type, 'error');
});
test('health and administration requests are never replaced by the offline page', () => {
  const app = worker(async () => new Response('app'));
  assert.equal(app.request('/health'), undefined);
  assert.equal(app.request('/admin/sessions'), undefined);
  assert.equal(app.request('/features/missing.mjs'), undefined);
});
test('server errors are preserved instead of showing stale HTML as a success', async () => {
  const app = worker(async () => new Response('sign in', { status: 403 }));
  app.stored.set('https://terminal.example.com/', new Response('old app'));
  assert.equal((await app.request('/')).status, 403);
});
