const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isTrustedRequest } = require('../src/request-boundary');
test('local HTTP and same-origin browser requests pass', () => {
 assert.equal(isTrustedRequest({headers:{host:'localhost:11001'}},11001),true);
 assert.equal(isTrustedRequest({headers:{host:'localhost:11001',origin:'http://localhost:11001'}},11001),true);
});
test('DNS rebinding, null origins, other ports and cross-site websockets are rejected', () => {
 for (const headers of [{host:'evil.example:11001'}, {host:'localhost:11001',origin:'null'}, {host:'localhost:11001',origin:'http://localhost:1234'}, {host:'localhost:11001',origin:'https://evil.example'}, {host:'localhost:11001','sec-fetch-site':'cross-site'}]) assert.equal(isTrustedRequest({headers},11001),false);
});
