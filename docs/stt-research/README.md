# Voice / STT Input for TerminalOne on iPhone & iPad: Research Report

*Generated: 2026-06-22 | Sources: ~30 (web_search, primary-source verified) | Confidence: Medium-High*

> Goal: let the user enter terminal commands by VOICE on iPhone/iPad without opening the cumbersome native keyboard, BYPASSING the iOS Web Speech API (which is dead in standalone PWA).

## Executive summary

- **The reframe that unlocks this:** the Web Speech API (`webkitSpeechRecognition`) is the *worst* option for our constraints. The winning family is **capture raw mic audio with `getUserMedia` → run ASR SERVER-SIDE on the M4 Mac → inject the transcript once.** This bypasses (a) the Web Speech API's PWA death, (b) iPhone in-browser memory limits, and (c) gives Parakeet-class latency (~80 ms inference, ~380–520 ms end-to-end).
- **Good news on the fullscreen tension:** unlike the Speech *Recognition* API (truly dead in PWA), `getUserMedia` was **fixed for standalone PWA in iOS 13.4** (WebKit #185448). The remaining PWA bugs are permission **re-prompts** (#215884) and track **muting after route changes** (#212040) — annoying, not fatal. So the server-side-ASR path **may even work in PWA/fullscreen**, pending on-device confirmation. We might not have to choose between fullscreen and voice after all.
- **Hard gate, unchanged:** mic access requires a **secure context (HTTPS)**. `http://localhost` is exempt; `http://<lan-ip>` is **not**. TerminalOne's server is HTTP-only (`src/server.js:502`), so the iPhone MUST reach it over **Tailscale serve / Caddy TLS**.
- **Gemma 3n** genuinely does on-device ASR (audio input, 140+ languages) — but only via Hugging Face Transformers / Google AI Edge, **not** via Ollama/llama.cpp/MLX (those are text-only in practice today). It's powerful but overkill for plain command transcription; **Parakeet** is the right tool.
- **In-browser ASR on iPhone** (Moonshine/Whisper via transformers.js) is PARTIAL/risky: Safari memory caps (~300 MB reliable), foreground kills, the official whisper-web demo is reported broken on iOS, WASM runs 2–5× slower than real-time, and WebGPU only arrived in iOS 26. Not the primary path.
- **Native ceiling:** ShellFish wins because it's native (SFSpeechRecognizer; iOS 26 adds SpeechAnalyzer, on-device, ~2× faster than Whisper LV3 Turbo). A web app cannot reach those APIs — so we can't match ShellFish, only route around it via server-side ASR.

## 1. iOS mic capture feasibility

**Verdict: getUserMedia in Safari tab = VIABLE; in standalone PWA = PARTIAL (works since iOS 13.4, but buggy permissions).**

- WebKit #185448 ("getUserMedia not working in apps added to home screen in standalone mode") was **resolved in iOS 13.4 beta 1** ([bugs.webkit.org #185448](https://bugs.webkit.org/show_bug.cgi?id=185448)). It is NOT a permanent silent failure.
- Residual PWA bugs: permission not persisted / re-prompts when hash changes ([#215884](https://bugs.webkit.org/show_bug.cgi?id=215884)); media tracks muted after route change in standalone PWA ([#212040](https://bugs.webkit.org/show_bug.cgi?id=212040)); PWA `<video>` can't play a getUserMedia stream ([#252465](https://bugs.webkit.org/show_bug.cgi?id=252465)).
- Secure context: `getUserMedia` only in HTTPS; `localhost` exempt, LAN-IP not ([MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)).
- Codecs: iOS Safari supports `audio/mp4`(AAC) broadly and `audio/webm;codecs=opus` on newer iOS; `AudioWorklet` is available for raw PCM. (Plan for AAC/mp4 fallback.)
- WebGPU shipped in **iOS 26 / Safari 26** only ([web.dev WebGPU](https://web.dev/webgpu/)) — too new to rely on for in-browser acceleration.

**Landmines:** mic permission re-prompts in PWA; must serve over HTTPS; do not depend on WebGPU.

## 2. Server-side ASR on the M4 (RECOMMENDED engine) + Gemma 3n

**Verdict: M4 server-side Whisper/Parakeet-class ASR = VIABLE (fast). Gemma 3n audio ASR locally = PARTIAL (HF Transformers / AI Edge only).**

- **Parakeet TDT (parakeet-mlx)** — ~80 ms latency on Apple Silicon, 3–6× faster than Whisper, real-time streaming, runs on the Neural Engine; Parakeet v3 ~10× faster than Whisper Large v3 Turbo ([Dictato](https://dicta.to/blog/whisper-vs-parakeet-vs-apple-speech-engine/), [Whisper Notes](https://whispernotes.app/blog/parakeet-v3-default-mac-model), [senstella/parakeet-mlx](https://github.com/senstella/parakeet-mlx)). **Best fit for short command dictation.**
- **whisper.cpp (Metal)** on Mac mini M4 — fast for batch/segment transcription ([itblog.today](https://itblog.today/blog/building/whisper-metal.html)); **WhisperKit** ~150–300 ms, 2.2% WER on the Neural Engine ([MacParakeet](https://macparakeet.com/blog/whisper-to-parakeet-neural-engine/)); **MetalRT** (2026) reports 714× real-time, 1.68 s end-to-end ([RunAnywhere](https://www.runanywhere.ai/blog/metalrt-speech-fastest-stt-tts-apple-silicon)).
- **Pitfall:** naive chunked "live streaming" can be pathologically slow (~5–7 s to process 1 s of audio, latency snowballs) ([whisper.cpp #3567](https://github.com/ggml-org/whisper.cpp/discussions/3567)). **Use push-to-talk batch-per-utterance, not continuous chunking.**
- **Gemma 3n audio:** accepts audio for ASR + translation, 6.25 tokens/s, 30 s clips (streaming encoder for longer), 140+ languages, E2B ~2 GB / E4B ~3 GB ([ai.google.dev audio](https://ai.google.dev/gemma/docs/capabilities/audio), [Gemma 3n overview](https://ai.google.dev/gemma/docs/gemma-3n), [Google dev guide](https://developers.googleblog.com/en/introducing-gemma-3n-developer-guide/)). **BUT** Ollama/llama.cpp/MLX are text-only for inference in practice; audio needs **HF Transformers** or **Google AI Edge** ([InfoQ](https://www.infoq.com/news/2025/07/gemma-3n-architecture/)). Overkill for command STT; reserve for ASR+understanding.

**Recommendation:** Parakeet (parakeet-mlx) as a Python sidecar the Node server calls; whisper.cpp/WhisperKit as alternates.

## 3. In-browser ASR on iPhone (fallback only)

**Verdict: PARTIAL → NOT-VIABLE-as-primary.**

- Best candidate: **Moonshine-tiny** (27M params, ~50 MB quantized ONNX, 5× less compute than Whisper-tiny, built for edge) ([Moonshine paper](https://arxiv.org/abs/2410.15608), [rasc.ch](https://blog.rasc.ch/2025/01/transformers-js-speech.html)); Whisper-tiny.en ~78 MB.
- iOS Safari memory reality: ">300 MB not reliable", Emscripten default 2 GB max causes `RangeError: out of memory` on iOS, "Safari kills you in the foreground if you allocate too much" ([dotnet #84638](https://github.com/dotnet/runtime/issues/84638), [WASM design #1397](https://github.com/WebAssembly/design/issues/1397)).
- The official **whisper-web demo is reported broken on iOS Safari** (sticks after model load) ([transformers.js #1298](https://github.com/huggingface/transformers.js/issues/1298)).
- WASM Whisper-tiny runs **2–5× slower than real-time** ([MLMastery](https://machinelearningmastery.com/multimodal-browser-ai-with-transformers-js-for-images-and-speech/)). No WebGPU pre-iOS-26.

**Use only as an offline fallback later, with Moonshine-tiny + Web Workers + model caching.**

## 4. Prior art + accuracy techniques + streaming architecture

**Verdict: push-to-talk web→server streaming ASR is a SOLVED pattern.**

- **Native ceiling / ShellFish:** native iOS uses **SFSpeechRecognizer** (on-device when `requiresOnDeviceRecognition=true`, partial results, ~1 min cap); **iOS 26 SpeechAnalyzer** replaces it — on-device, long-form, ~2× faster than Whisper LV3 Turbo ([SpeechAnalyzer guide](https://antongubarenko.substack.com/p/ios-26-speechanalyzer-guide), [WWDC25](https://developer.apple.com/videos/play/wwdc2025/277/)). Web apps cannot access these.
- **Shell-command accuracy techniques:**
  - **Vocabulary hints** — Claude Code's voice dictation feeds coding terms (regex, OAuth, JSON, localhost) + current project & git-branch names as recognition hints ([Claude Code voice](https://code.claude.com/docs/en/voice-dictation)). Parakeet/Whisper support biasing/hints; do the same.
  - **AI-formatted vs literal punctuation** — superwhisper infers punctuation/formatting from context and offers a "literal punctuation" mode for symbols ([superwhisper](https://superwhisper.com/), [changelog](https://superwhisper.com/changelog)).
  - **Push-to-talk (hold-to-talk)** dictation in short bursts is the proven UX ([Claude Code voice](https://code.claude.com/docs/en/voice-dictation)).
  - **Review-before-run** for shell safety (don't auto-execute a misheard `rm`).
- **Streaming architecture:** WebSocket streaming raw PCM (no HTTP overhead) + **Silero/HF VAD** to segment speech; reference impl **VoiceStreamAI** (Python server + JS client, Whisper + VAD over WebSocket) reports **380–520 ms end-to-end**, WER <3% ([VoiceStreamAI](https://github.com/alesaccoia/VoiceStreamAI), [WhisperX+Silero](https://medium.com/@aidenkoh/how-to-implement-high-speed-voice-recognition-in-chatbot-systems-with-whisperx-silero-vad-cdd45ea30904)).
- **Inject once:** send the FINAL transcript exactly once through TerminalOne's raw path `guard.send()` (resets the dedup buffer — `input-guard.mjs:109`), never `term.onData`, never interim results.

## Recommended architecture

**Primary path — server-side ASR (highest confidence):**
1. **Delivery:** iPhone loads TerminalOne over **Tailscale HTTPS** (secure context — mandatory).
2. **UI:** a push-to-talk 🎤 button in the keybar (hold to talk / tap to toggle). No native keyboard ever opens.
3. **Capture:** `getUserMedia` → `MediaRecorder` (opus/webm; mp4/aac fallback) or `AudioWorklet` PCM.
4. **Transport:** stream audio frames over the **existing WebSocket** to the Node server (new message type).
5. **ASR:** Node spawns/calls a **Parakeet (parakeet-mlx)** sidecar on the M4 (batch-per-utterance). Optional Silero VAD to trim silence.
6. **Inject:** on final transcript → `guard.send(transcript)` once; **review-before-run** (show in an input line, user taps Enter) for safety; feed command vocab + cwd/branch as hints.

**Decision tree:**
| You want… | Path | Confidence |
|---|---|---|
| Voice, URL bar OK | Safari tab (Tailscale HTTPS) + server-side Parakeet | **High** |
| Voice **and** fullscreen | PWA + getUserMedia + server-side ASR — **verify on-device** mic works in PWA (re-prompts expected); fall back to Safari tab if broken | Medium (needs probe) |
| Fullscreen, no voice | In-app full keypad (Solution A) — works in PWA | High |

## Open verification (owner / on-device — not agent-provable)
1. Confirm iPhone reaches TerminalOne over **HTTPS** (Tailscale/Caddy), not http LAN-IP.
2. **Probe** whether `getUserMedia` works in YOUR iOS in **standalone PWA** (re-prompt tolerable?) vs Safari tab.
3. Confirm mic-permission UX is acceptable.

## Methodology & honesty notes
- Searched ~12 queries via `web_search`; verified the pivotal getUserMedia/PWA claim against **primary** WebKit Bugzilla entries rather than secondary blogs.
- **Correction:** the parallel subagent `IosMicFeasibility` reported getUserMedia "fails silently / NOT VIABLE" in PWA and cited several URLs I could **not** independently confirm (magicbell.io/blog, testmu.ai, matija.dev, clipy.online, appdevmagazine). Primary sources show #185448 was fixed in iOS 13.4; the real PWA issues are re-prompts/muting. This report uses the corrected, primary-sourced position. Three of four research subagents failed to deliver structured output (ended turns text-only and idled); those angles were re-gathered directly.
- Latency/throughput numbers are vendor/blog benchmarks ([INFERENCE] for our exact hardware) — treat as order-of-magnitude until measured on this M4.

## Sources (primary first)
- WebKit Bugzilla: [#185448](https://bugs.webkit.org/show_bug.cgi?id=185448), [#215884](https://bugs.webkit.org/show_bug.cgi?id=215884), [#212040](https://bugs.webkit.org/show_bug.cgi?id=212040), [#252465](https://bugs.webkit.org/show_bug.cgi?id=252465)
- MDN: [getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) · web.dev: [WebGPU](https://web.dev/webgpu/)
- Google: [Gemma 3n audio](https://ai.google.dev/gemma/docs/capabilities/audio), [Gemma 3n overview](https://ai.google.dev/gemma/docs/gemma-3n), [dev guide](https://developers.googleblog.com/en/introducing-gemma-3n-developer-guide/) · [InfoQ Gemma 3n](https://www.infoq.com/news/2025/07/gemma-3n-architecture/)
- Parakeet/Whisper on Apple Silicon: [senstella/parakeet-mlx](https://github.com/senstella/parakeet-mlx), [Dictato](https://dicta.to/blog/whisper-vs-parakeet-vs-apple-speech-engine/), [Whisper Notes](https://whispernotes.app/blog/parakeet-v3-default-mac-model), [MacParakeet](https://macparakeet.com/blog/whisper-to-parakeet-neural-engine/), [RunAnywhere MetalRT](https://www.runanywhere.ai/blog/metalrt-speech-fastest-stt-tts-apple-silicon), [whisper.cpp on M4](https://itblog.today/blog/building/whisper-metal.html), [whisper.cpp #3567](https://github.com/ggml-org/whisper.cpp/discussions/3567)
- In-browser: [Moonshine paper](https://arxiv.org/abs/2410.15608), [transformers.js speech](https://blog.rasc.ch/2025/01/transformers-js-speech.html), [whisper-web #1298](https://github.com/huggingface/transformers.js/issues/1298), [iOS WASM memory](https://github.com/dotnet/runtime/issues/84638)
- iOS native + prior art: [SpeechAnalyzer guide](https://antongubarenko.substack.com/p/ios-26-speechanalyzer-guide), [WWDC25 SpeechAnalyzer](https://developer.apple.com/videos/play/wwdc2025/277/), [Claude Code voice](https://code.claude.com/docs/en/voice-dictation), [superwhisper](https://superwhisper.com/), [VoiceStreamAI](https://github.com/alesaccoia/VoiceStreamAI)

## Sub-question raw data
- `docs/stt-research/ios-mic-feasibility.md` — raw structured output from the `IosMicFeasibility` subagent (angle 1; read with the correction above).
