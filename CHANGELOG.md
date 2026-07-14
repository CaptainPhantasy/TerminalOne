# Changelog

All notable changes to TerminalOne.

## Unreleased

- The Floyd action now launches the admitted TUI with Core-owned project, session,
  run, and optional event identifiers. Missing or inconsistent active context fails
  closed before TerminalOne writes a command to the PTY.

## [1.0.0] — 2026-06-26

### Initial public release

This is the first public release of TerminalOne, a browser-based terminal emulator
with 38 feature modules and PWA install support.

### Features

- Live PTY terminal via WebSocket — your actual shell, in your browser
- 38 feature modules covering command palette, session switching, search, clipboard,
  export, zoom, theme catalog, autosave, OS notification bridge, configurable key bar,
  and more
- PWA support — install on iPad/iPhone as a standalone fullscreen app
- macOS launchd service installer with `t1` CLI launcher and Spotlight integration
- Responsive layout across phone, tablet, and desktop
- Settings import/export and theme system with dark/light mode
- 20/20 ShellFish-parity features implemented and tested

### Build and test

- 5 test suites (input-guard, smoke, feature, feature-behavior, responsive)
- Install/uninstall/reinstall verified end-to-end
- Beta release review cleared with no blockers (docs/BETA_RELEASE_READINESS_2026-06-26.md)
