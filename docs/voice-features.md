# Voice Features — Implementation Roadmap (TerminalOne)

**Status:** IMPLEMENTED for the local Whisper-backed web path; real iPhone HTTPS/PWA microphone behavior remains OWNER-VERIFY.
**Doc type:** non-governed working doc (lives in `docs/` per `.supercache/doc-management.json`)
**Source of truth for the research behind this:** `docs/stt-research/README.md`
**Convention:** check a box `- [x]` ONLY after the step is implemented **and** verified with evidence. No box flips on intent.

> Feature: voice → terminal input on iPhone/iPad with NO native keyboard, via raw mic capture (`getUserMedia`) + **server-side ASR on the Mac** (currently local `whisper`, configurable with `TERMINALONE_STT_BIN`), bypassing the iOS Web Speech API (dead in PWA).

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
- [x] **0.4 Decide ASR engine** (default now: local `whisper` CLI via `TERMINALONE_STT_BIN`; Parakeet remains a future faster option). *Research §2.*
  - *Evidence:* `npm run test:voice` uses a local mock Whisper executable and verifies server invocation/response without network or model download.

## Phase 1 — Microphone capture (browser, new feature module)

- [x] **1.1 Create `public/features/voice-input.mjs`**, registered in the `FEATURE_MODULES` list.
- [x] **1.2 Add a push-to-talk/tap-to-toggle Voice button** to the toolbar and active touch-device keybar. Hold-to-talk semantics are represented as tap start/stop for browser reliability; target remains ≥44pt.
- [ ] **1.3 Capture audio via `getUserMedia`** on button-press (user gesture). Code path implemented with `MediaRecorder`; real microphone capture still requires on-device HTTPS verification.
  - *Evidence so far:* `voice-input.mjs` implements `getUserMedia` + `MediaRecorder`; `npm run test:behavior` verifies UI/module load, not physical mic frames.
- [x] **1.4 Handle permission denial / no-mic** gracefully (toast, disable button). *Landmine F10.*

## Phase 2 — Audio transport (browser ↔ server)

- [x] **2.1 Choose framing**: base64 audio inside JSON `{type:'voice-chunk', b64}` plus `{type:'voice-end'}`.
- [x] **2.2 Register the new message type(s)** in `handleMessage`.
- [x] **2.3 Stream chunks on a push-to-talk window** with 500 ms MediaRecorder chunks and a 20 s max utterance.
  - *Evidence:* `npm run test:voice` verifies no `UNKNOWN_MESSAGE` on `voice-start/chunk/end`.
- [x] **2.4 Backpressure/size guard** — 512 KiB chunk cap and 8 MiB utterance cap.
  - *Evidence:* `npm run test:voice` verifies `VOICE_CHUNK_TOO_LARGE`.

## Phase 3 — Server-side ASR (M4)

- [x] **3.1 Add an ASR sidecar** the Node server invokes. Implemented as local `whisper` CLI / `TERMINALONE_STT_BIN`, process-isolated from the PTY.
- [x] **3.2 On `voice-end`**, assemble the utterance, transcribe, return `{type:'voice-transcript', text}` to the browser.
- [ ] **3.3 Feed recognition hints** — command vocabulary + cwd + git branch (like Claude Code). *Landmine F7; Research §4.*
  - *Done when:* a spoken `git status` round-trips to correct text in < ~1 s end-to-end on the M4.
- [x] **3.4 Privacy check** — transcription path shells out only to local `whisper` / configured local executable; no cloud endpoint is called by TerminalOne.

## Phase 4 — Inject + UX (the safety-critical part)

- [x] **4.1 Inject the FINAL transcript exactly once** via `T1.sendData(text)`.
- [x] **4.2 Review-before-run**: insert text without Enter.
- [x] **4.3 Spoken-symbol grammar** maps "pipe", "slash", "dash dash", and "dot".
- [x] **4.4 Visual states** — idle/listening/transcribing classes on voice buttons plus toast errors.

## Phase 5 — Accuracy & safety hardening

- [x] **5.1 Dangerous-command guard** — risky command patterns require confirm before insertion.
- [x] **5.2 Casing/punctuation normalization** for shell (trim whitespace and trailing sentence punctuation).
- [x] **5.3 Reconnect behavior** — voice sends through the live `T1.ws` getter and `T1.sendData` path.

## Phase 6 — Verification & tests (evidence before "done")

- [x] **6.1 Server unit:** new WS types accepted; oversized frames rejected safely.
- [x] **6.2 Round-trip integration:** scripted audio → server ASR → `voice-transcript`; browser test verifies transcript injection exactly once.
- [ ] **6.3 On-device (owner):** real iPhone over HTTPS — mic prompt, push-to-talk, transcript appears, review-before-run, Enter executes. Confirm in chosen delivery mode (tab vs PWA).
- [x] **6.4 Regression:** existing suites run individually with voice added.

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
