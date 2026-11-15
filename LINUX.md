# Private deployment on Linux

These are optional, deployment-neutral features of TerminalOne, not a separate
fork or distribution. With no environment variables set, TerminalOne behaves
exactly as it does upstream.

## Keep the default loopback listener

`HOST` defaults to `127.0.0.1`. A non-loopback address exposes a real shell, so
TerminalOne refuses to start on one unless `TERMINALONE_POLICY_MODULE` provides
authentication. For remote access, prefer the authenticated HTTPS proxy
described in the README.

## Private Unix socket

Set `TERMINALONE_SOCKET=/path/to/socket` to listen on a Unix socket instead of
TCP. The socket is created with mode `0600`. A graceful shutdown removes it.

If a socket already exists, startup is refused rather than replacing a live
listener. After a crash, verify that no TerminalOne process is using the socket,
move the stale socket aside (for example into a dated quarantine directory), and
start again.

The socket bypasses the loopback Host-header boundary because filesystem
permissions are the access gate. Keep the socket in a directory that only the
service account can reach.

## Optional policy module

Set `TERMINALONE_POLICY_MODULE=/path/to/policy.js` to load a policy module.
The module may export:

- `authenticate(req)` -> principal
- `validOrigin(req)` -> boolean
- `profile(req)` -> object
- `select(session, message)`
- `launch(session, cwd)` -> `{ command, args, env, cwd, initialInput? }`
- `canResume(caller, target, message)` -> boolean

The policy runs before the HTTP routes and the WebSocket handshake.
`authenticate` establishes a principal, `validOrigin` approves sensitive
actions, `profile` supplies the `/session-profile` response, and `select`,
`launch`, and `canResume` control PTY creation and resume. If the module is
absent, the upstream request-boundary checks apply.

A minimal module looks like this:

```js
module.exports = {
  authenticate() { return 'local-operator'; },
  validOrigin() { return true; },
  profile() { return { requireDirectory: false }; },
  select(session) { session.owner = 'local-operator'; },
  launch(session, cwd) {
    return {
      command: '/bin/bash',
      args: ['-l'],
      env: { ...process.env, TERM: 'xterm-256color' },
      cwd: cwd || process.env.HOME,
    };
  },
  canResume() { return true; },
};
```

No deployment-specific configuration, credentials, or paths are included here.

## Tests

`npm run test:linux` starts a server on a temporary Unix socket with a test
policy module. It checks the socket mode, health, profile, session listing, the
non-loopback guard, stale-socket refusal, and socket cleanup on shutdown.
