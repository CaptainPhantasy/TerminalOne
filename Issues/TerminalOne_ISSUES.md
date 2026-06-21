# TerminalOne Issues

Initialized: 2026-06-17T14:07:01-04:00

## Open Issues

- No open issues.

## Resolved Issues

- **RESOLVED 2026-06-19** — App exceeded the iPad/tablet viewport (bottom key bar/footer clipped off-screen). Root cause: safe-area insets double-counted — `body` carried `env(safe-area-inset-*)` padding AND `.app-shell` used `100vh`, so under `viewport-fit=cover` the layout overflowed by exactly top+bottom insets. Fix: moved insets onto `.app-shell` (the element that owns height, `border-box`), switched to `100dvh/dvw` with `vh/vw` fallback (tracks Safari URL bar, Split View, Stage Manager), removed redundant keybar bottom inset, hardened `#terminal` overflow, added tablet/Split-View/landscape-with-keyboard media queries. Verified across 10 tablet viewports incl. iPad A16 11th-gen (820×1180) via tests/responsive-test.js.
