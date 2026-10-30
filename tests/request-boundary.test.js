const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isTrustedRequest, createRequestBoundary } = require('../src/request-boundary');
test('local HTTP and same-origin browser requests pass', () => {
 assert.equal(isTrustedRequest({headers:{host:'localhost:11001'}},11001),true);
 assert.equal(isTrustedRequest({headers:{host:'localhost:11001',origin:'http://localhost:11001'}},11001),true);
});
test('an explicitly configured HTTPS origin can reach HTTP and WebSocket boundaries', () => {
 const trusted = createRequestBoundary(11001, 'https://terminal.example.com, https://tablet.example.com:8443');
 for (const headers of [
  { host: 'terminal.example.com' },
  { host: 'terminal.example.com', origin: 'https://terminal.example.com', 'sec-fetch-site': 'same-origin' },
  { host: 'tablet.example.com:8443', origin: 'https://tablet.example.com:8443' },
  { host: 'localhost:11001', origin: 'http://localhost:11001' }
 ]) assert.equal(trusted({ headers }), true, JSON.stringify(headers));
});
test('remote access stays opt-in and rejects mismatched, insecure and spoofed origins', () => {
 assert.equal(isTrustedRequest({ headers: { host: 'terminal.example.com', origin: 'https://terminal.example.com' } }, 11001), false);
 const trusted = createRequestBoundary(11001, 'https://terminal.example.com,https://tablet.example.com');
 for (const headers of [
  { host: 'terminal.example.com.evil.test', origin: 'https://terminal.example.com.evil.test' },
  { host: 'terminal.example.com', origin: 'http://terminal.example.com' },
  { host: 'terminal.example.com', origin: 'https://tablet.example.com' },
  { host: 'localhost:11001', origin: 'https://terminal.example.com' },
  { host: 'evil.test', 'x-forwarded-host': 'terminal.example.com' },
  { host: 'terminal.example.com', origin: 'https://terminal.example.com', 'sec-fetch-site': 'cross-site' },
  { host: 'terminal.example.com', origin: 'null' },
  { host: 'terminal.example.com', origin: 'https://user@terminal.example.com' },
  { host: 'terminal.example.com', origin: 'https://terminal.example.com/path' },
  { host: 'terminal.example.com', origin: ['https://terminal.example.com'] }
 ]) assert.equal(trusted({ headers }), false, JSON.stringify(headers));
});
test('invalid trusted-origin configuration fails closed at startup', () => {
 for (const origin of ['*', 'https://*.example.com', 'http://terminal.example.com', 'https://user:password@terminal.example.com', 'https://terminal.example.com/path', 'https://terminal.example.com?x=1', 'https://terminal.example.com#fragment']) {
  assert.throws(() => createRequestBoundary(11001, origin), /TERMINALONE_TRUSTED_ORIGINS/);
 }
});
test('DNS rebinding, null origins, other ports and cross-site websockets are rejected', () => {
 for (const headers of [{host:'evil.example:11001'}, {host:'localhost:11001',origin:'null'}, {host:'localhost:11001',origin:'http://localhost:1234'}, {host:'localhost:11001',origin:'https://evil.example'}, {host:'localhost:11001','sec-fetch-site':'cross-site'}]) assert.equal(isTrustedRequest({headers},11001),false);
});
