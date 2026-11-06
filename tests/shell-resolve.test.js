'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveShell } = require('../src/shell-resolve');

const only = (...present) => (file) => present.includes(file);

test('uses $SHELL when it exists', () => {
  assert.equal(resolveShell({ env: { SHELL: '/usr/bin/fish' }, account: () => '/bin/bash', executable: only('/usr/bin/fish', '/bin/bash') }), '/usr/bin/fish');
});

test('falls back to the account shell when $SHELL is unset', () => {
  assert.equal(resolveShell({ env: {}, account: () => '/bin/bash', executable: only('/bin/bash') }), '/bin/bash');
});

test('skips a missing /bin/zsh on hosts without zsh', () => {
  assert.equal(resolveShell({ env: {}, account: () => '', executable: only('/bin/bash', '/bin/sh') }), '/bin/bash');
  assert.equal(resolveShell({ env: { SHELL: '/bin/zsh' }, account: () => '', executable: only('/bin/sh') }), '/bin/sh');
});

test('keeps zsh first on macOS-style hosts', () => {
  assert.equal(resolveShell({ env: {}, account: () => '', executable: only('/bin/zsh', '/bin/bash', '/bin/sh') }), '/bin/zsh');
});

test('ignores relative $SHELL values and names the historical default when nothing exists', () => {
  assert.equal(resolveShell({ env: { SHELL: 'bash' }, account: () => '', executable: only('/bin/sh') }), '/bin/sh');
  assert.equal(resolveShell({ env: {}, account: () => '', executable: () => false }), '/bin/zsh');
});
