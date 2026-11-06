'use strict';

const fs = require('fs');
const os = require('os');

// macOS ships zsh as the login shell, so it stays the preferred fallback, but Linux
// hosts and service managers (systemd, launchd plists, CI) often start TerminalOne
// without $SHELL and without /bin/zsh. Spawning a missing shell makes every session
// exit immediately (execvp ENOENT), so fall back to a shell that actually exists.
const FALLBACK_SHELLS = ['/bin/zsh', '/bin/bash', '/bin/sh'];

function isExecutable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch (_) {
    return false;
  }
}

function accountShell() {
  try {
    return os.userInfo().shell || '';
  } catch (_) {
    return '';
  }
}

/**
 * Resolve the login shell to spawn: $SHELL, then the account's shell, then the
 * first existing fallback. Absolute paths are checked for executability.
 */
function resolveShell({ env = process.env, account = accountShell, executable = isExecutable } = {}) {
  const candidates = [env.SHELL, account(), ...FALLBACK_SHELLS];
  for (const candidate of candidates) {
    if (candidate && candidate.startsWith('/') && executable(candidate)) return candidate;
  }
  // Nothing verifiable: keep the historical default so the error message names it.
  return env.SHELL || '/bin/zsh';
}

module.exports = { resolveShell, FALLBACK_SHELLS };
