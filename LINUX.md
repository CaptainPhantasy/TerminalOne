# Linux variant

This branch adds two optional, deployment-neutral features to TerminalOne.
When neither environment variable is set, behaviour is the same as upstream.

## Private Unix socket

Set `TERMINALONE_SOCKET=/path/to/socket` to listen on a Unix socket instead of
TCP. The socket is created with mode `0600`. If a socket already exists at that
path, startup is refused rather than replacing it.

## Optional policy module

Set `TERMINALONE_POLICY_MODULE=/path/to/policy.js` to load a policy module.
The module may export:

- `authenticate(req)` -> principal
- `validOrigin(req)` -> boolean
- `profile(req)` -> object
- `select(session, message)`
- `launch(session)` -> `{ command, args, env, cwd, initialInput? }`
- `canResume(caller, target, message)` -> boolean

The policy runs before the HTTP routes and the WebSocket handshake. If the
module is absent, the upstream request-boundary checks apply.

No deployment-specific configuration, credentials, or paths are included in
this branch.
