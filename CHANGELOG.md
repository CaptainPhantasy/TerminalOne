# Changelog

All notable changes to TerminalOne.

## [1.0.3] — 2026-11-08

- Added a Voice / speech-to-text settings section. The STT command, model, language, and argument template are saved server-side in `~/.config/terminalone/voice.json` and used at transcription time.
- Audio is staged under `~/.cache/terminalone`; the server accepts `.txt` or `.srt` output and no longer assumes `whisper` on `PATH` or a fixed `tiny.en` model.
- Explicit `TERMINALONE_STT_*` environment values override the saved setting for deployment and tests.

## [1.0.2] — 2026-11-06

- Added a one-tap **Ctrl+b** shortcut for herdr to the iPhone/iPad key bar and the Snippets row. It sends Control plus lowercase b immediately, without switching keyboards or pressing Enter.
- Bound shell respawn storms, preserved early input, and reset terminal context more cleanly after disconnects.
- Fall back to an available shell when `/bin/zsh` is missing on the host.
- Hardened browser input-guard so short batched keystrokes are not dropped.
- Patched body-parser, proxy-addr, and qs advisories; pinned CI to Node 22.
- Updated package homepage to https://floydslabs.com and refreshed commercial studio screenshots.

## [1.0.0] — 2026-06-26

### Initial public release

This is the first public release of TerminalOne, a browser-based terminal emulator
with 39 feature modules and PWA install support.

### Features

- Live PTY terminal via WebSocket — your actual shell, in your browser
- 39 feature modules covering command palette, session switching, search, clipboard,
  export, zoom, theme catalog, autosave, OS notification bridge, configurable key bar,
  and more
- Voice input module with bounded browser microphone capture, local Whisper-backed
  server transcription, review-before-run insertion, and oversized audio guards
- PWA support — install on iPad/iPhone as a standalone fullscreen app
- macOS launchd service installer with `t1` CLI launcher and Spotlight integration
- Responsive layout across phone, tablet, and desktop
- Settings import/export and theme system with dark/light mode
- 20/20 ShellFish-parity features implemented and tested

### Build and test

- 6 test suites (input-guard, smoke, feature, feature-behavior, voice, responsive)
- Install/uninstall/reinstall verified end-to-end
- Beta release review cleared with no blockers (docs/BETA_RELEASE_READINESS_2026-06-26.md)
