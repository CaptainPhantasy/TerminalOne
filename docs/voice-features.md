# Voice Features — Implementation Roadmap (TerminalOne)

**Status:** PLANNED (nothing implemented yet — every box below is unchecked)
**Doc type:** non-governed working doc (lives in `docs/` per `.supercache/doc-management.json`)
**Source of truth for the research behind this:** `docs/stt-research/README.md`
**Convention:** check a box `- [x]` ONLY after the step is implemented **and** verified with evidence. No box flips on intent.

> Feature: voice → terminal input on iPhone/iPad with NO native keyboard, via raw mic capture (`getUserMedia`) + **server-side ASR on the M4** (Parakeet), bypassing the iOS Web Speech API (dead in PWA).

---

## Path viability — double-verified before committing

Each load-bearing assumption, checked against the repo or the research. This is the "is the path viable" gate.

| Assumption the roadmap depends on | Status | Evidence |
|---|---|---|
| There is a browser→server channel to carry audio | VERIFIED | WS, JSON frames, `server.js:414-418` |
| There is a raw inject path that resets the dedup buffer | VERIFIED | `T1.sendData` → `sendInputFn` = `guard.send` (`index.html:902-908`); `guard.send` resets buffer (`input-guard.mjs:109-111`) |
| Server applies input to the PTY | VERIFIED | `case 'input'` → `ptyProcess.write(data.data)` (`server.js:361-364`) |
| WS becomes `wss` automatically when page is HTTPS | VERIFIED | `index.html:998-999` |
| Server is HTTP-only today (secure-context gate is real) | VERIFIED | `start.sh:40` runs `node src/server.js` on `http://localhost`; `server.js:502` `http.createServer` |
| Unknown WS types are rejected (must register new types) | VERIFIED (footgun) | `default: wsError(... 'UNKNOWN_MESSAGE')` (`server.js:395`) |
| Every WS frame is `JSON.parse`d (binary audio breaks it) | VERIFIED (footgun) | `JSON.parse(message)` unconditional (`server.js:417`) |
| Server-side Parakeet/Whisper ASR is fast on M4 | RESEARCH-BACKED | `docs/stt-research/README.md` §2 (Parakeet ~80 ms) |
| `getUserMedia` works in Safari tab; PARTIAL in PWA | RESEARCH-BACKED | §1 (WebKit #185448 fixed iOS 13.4; #215884/#212040 residual) |
| Web Speech API is dead in PWA | RESEARCH-BACKED | §0/§4 |
| iPhone reaches app over HTTPS (Tailscale/Caddy) | **OWNER-VERIFY** | not in repo; must confirm |
| `getUserMedia` actually fires in YOUR iOS PWA | **OWNER-VERIFY** | needs on-device probe (Phase 0) |

**Verdict: path is VIABLE for the Safari-tab + server-side-ASR route (high confidence). The PWA-fullscreen+voice route is CONDITIONAL on the Phase 0 probe.**

---

## Phase 0 — Decision & prerequisites (BLOCKS everything; some owner-only)

- [ ] **0.1 Confirm HTTPS delivery to the iPhone.** Mic needs a secure context; `http://<lan-ip>` is blocked. Serve TerminalOne via Tailscale serve / Caddy TLS. **Owner-verify.** *Landmine F3.*
  - *Done when:* opening the app on the iPhone shows `https://` and the WS connects as `wss://` (devtools / status reaches "Connected").
- [ ] **0.2 Pick the delivery mode** (decision, owner): **(A)** Safari tab + voice [recommended], **(B)** PWA + voice [needs 0.3], or **(C)** PWA fullscreen + in-app keypad, no voice.
- [ ] **0.3 (only if B) Build a throwaway getUserMedia-in-PWA probe.** A one-file page that requests mic + logs success/permission/muting in standalone PWA on the actual iOS. *Landmine F4.*
  - *Done when:* probe proves mic frames arrive in standalone PWA (re-prompt tolerable), OR proves it fails → fall back to mode A or C.
- [ ] **0.4 Decide ASR engine** (default: **Parakeet via `parakeet-mlx`** Python sidecar; alternates whisper.cpp/WhisperKit). Confirm it installs/runs on the M4. *Research §2.*
  - *Done when:* `parakeet-mlx` transcribes a local WAV from CLI on the M4 with sane latency (< ~1 s for a short clip).

## Phase 1 — Microphone capture (browser, new feature module)

- [ ] **1.1 Create `public/features/voice-input.mjs`**, gated to touch devices (`T1.device === 'iphone' || 'ipad'`), registered in the `FEATURE_MODULES` list (`index.html:1193`).
- [ ] **1.2 Add a push-to-talk 🎤 button** to the keybar / toolbar (`T1.ui.toolbar()` or a keybar key). Hold-to-talk; ≥44pt target (reuse the 44pt convention).
- [ ] **1.3 Capture audio via `getUserMedia`** on button-press (user gesture). Use `MediaRecorder` (`audio/webm;codecs=opus`, fallback `audio/mp4`/AAC) or `AudioWorklet` for PCM. *Landmine F4, codecs.*
  - *Done when:* pressing the button yields audio blobs/frames in a quick console/eval test on desktop Chrome AND on the iPhone over HTTPS.
- [ ] **1.4 Handle permission denial / no-mic** gracefully (toast, disable button). *Landmine F10.*

## Phase 2 — Audio transport (browser ↔ server)

- [ ] **2.1 Choose framing** to avoid the JSON-only handler footgun (`server.js:417`). v1: **base64 audio inside JSON** `{type:'voice-chunk', seq, b64}` + `{type:'voice-end', seq}`. (v2 optional: binary-frame branch in `ws.on('message')` checking `isBinary` before `JSON.parse`.) *Landmines F1, F2.*
- [ ] **2.2 Register the new message type(s)** in `handleMessage` switch (`server.js:326`) so they aren't rejected by the `default` (`server.js:395`). Guard them behind active session.
- [ ] **2.3 Stream chunks on a push-to-talk window** (start on press, end on release). **Do NOT do naive continuous 1-s chunking** — it snowballs latency. *Landmine F6.*
  - *Done when:* server logs received audio bytes matching the spoken duration; no `PARSE_ERROR`/`UNKNOWN_MESSAGE`.
- [ ] **2.4 Backpressure/size guard** — cap utterance length, drop/secure oversized frames. *Landmine F9.*

## Phase 3 — Server-side ASR (M4)

- [ ] **3.1 Add an ASR sidecar** the Node server invokes (spawn `parakeet-mlx` CLI, or a small local HTTP/stdio Python service). Keep it process-isolated from the PTY.
- [ ] **3.2 On `voice-end`**, assemble the utterance, (optionally Silero VAD trim), transcribe, return `{type:'voice-transcript', text}` to the browser. *Research §4 (VoiceStreamAI pattern).*
- [ ] **3.3 Feed recognition hints** — command vocabulary + cwd + git branch (like Claude Code). *Landmine F7; Research §4.*
  - *Done when:* a spoken `git status` round-trips to correct text in < ~1 s end-to-end on the M4.
- [ ] **3.4 Privacy check** — confirm transcription is fully local (no cloud fallback leaking audio). *Landmine F11.*

## Phase 4 — Inject + UX (the safety-critical part)

- [ ] **4.1 Inject the FINAL transcript exactly once** via `T1.sendData(text)` (→ `guard.send`, resets buffer — `index.html:902-908`). NEVER via `term.onData`; NEVER send interim results. *Landmine F8.*
- [ ] **4.2 Review-before-run**: drop the transcript onto the input line WITHOUT auto-Enter; user taps Enter to execute. Never auto-execute. *Landmine F7 (safety).*
- [ ] **4.3 Spoken-symbol grammar** (optional): map "pipe"→`|`, "dash dash"→`--`, "slash"→`/`, etc.; provide a literal mode. *Research §4 (superwhisper).*
- [ ] **4.4 Visual states** — listening / transcribing / error on the mic button; haptic on start/stop (reuse `haptic-keys`).

## Phase 5 — Accuracy & safety hardening

- [ ] **5.1 Dangerous-command guard** — if transcript matches `rm -rf`, `mkfs`, `dd`, etc., require explicit confirm. *Landmine F7.*
- [ ] **5.2 Casing/punctuation normalization** for shell (no auto-capitalization, no trailing period). *Landmine F7.*
- [ ] **5.3 Reconnect behavior** — voice must re-attach after WS reconnect (mirror `onTermReady` re-fire pattern).

## Phase 6 — Verification & tests (evidence before "done")

- [ ] **6.1 Server unit:** new WS types accepted; oversized/binary frames rejected safely (extend `tests/`). Run only the suites touched. *(Mind the ~30 s per-command cap — run suites individually.)*
- [ ] **6.2 Round-trip integration:** scripted audio → server ASR → `voice-transcript` → injected once (no duplication). Assert single injection (guard against doubling).
- [ ] **6.3 On-device (owner):** real iPhone over HTTPS — mic prompt, push-to-talk, transcript appears, review-before-run, Enter executes. Confirm in chosen delivery mode (tab vs PWA).
- [ ] **6.4 Regression:** existing `npm test` suites still green (run per-suite).

---

## Landmine / footgun register

| # | Landmine | Where it bites | Mitigation | Source |
|---|---|---|---|---|
| F1 | WS handler `JSON.parse`s every frame — binary audio throws | `server.js:417` | base64 audio in JSON (v1) or `isBinary` branch (v2) | repo |
| F2 | Unknown WS types rejected | `server.js:395` | register `voice-chunk`/`voice-end` in switch | repo |
| F3 | No TLS → mic blocked over LAN-IP http | `start.sh:40` | serve via Tailscale/Caddy HTTPS | repo + §1 |
| F4 | Web Speech API dead in PWA; getUserMedia PWA re-prompts/muting | iOS | use getUserMedia+server ASR; Phase 0 probe | §0/§1 |
| F5 | In-browser ASR OOM/kills on iPhone | iOS Safari | ASR server-side, not in-browser | §3 |
| F6 | Naive continuous chunking → latency snowball | ASR loop | push-to-talk batch-per-utterance | §2 |
| F7 | Misheard shell command = damage | inject | review-before-run + dangerous-cmd guard + hints | §4 |
| F8 | Doubling if routed through onData/interims | inject | `guard.send` once, final-only | repo + memory |
| F9 | WS audio backpressure/oversized frames | transport | cap length, chunk, guard | repo |
| F10 | Mic permission UX / denial | browser | graceful disable + toast | §1 |
| F11 | Audio leaving device via cloud fallback | ASR | enforce local-only ASR | §3 |

## Open owner decisions (block the build)
1. HTTPS delivery confirmed? (Tailscale/Caddy)
2. Delivery mode A / B / C?
3. If B: run the Phase 0.3 probe first.
