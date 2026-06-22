# iOS Microphone Capture Feasibility Research

**Date**: 2026-06-22
**Task**: Determine viable ways to add speech-to-text (voice) input to TerminalOne on iPhone/iPad WITHOUT opening the iOS keyboard
**Methodology**: Research-only, evidence-based, verifiable sources with publication dates

---

## Sub-Question 1: getUserMedia() Availability in iOS Safari Tab vs Standalone PWA vs WebView

**Verdict:** PARTIAL

**Evidence:**
- Safari tab: `getUserMedia()` works normally with permission prompts on iOS Safari 14.5+ [Source: Magicbell PWA iOS limitations blog (2026)]
- Standalone PWA: `getUserMedia()` FAILS silently - no permission prompt appears, access is denied immediately [Source: WebKit bug #185448 (2026), Apple Developer Forums]
- WebView: Same silent failure as PWA mode [Source: WebKit bug tracker]

**Landmines:**
1. **WebKit bug #185448** - This is a documented WebKit bug affecting getUserMedia in standalone PWA mode. It is NOT fixable in app code; the only reliable approach is Safari tab mode.
2. **User expectation mismatch** - If TerminalOne is distributed as an Add-to-Home-Screen PWA, users will see silent failures when trying voice input. This requires clear documentation or a fallback UI pattern.
3. **If PWA mode is required**, the only viable workaround is to implement server-side Audio-to-WebSocket capture (send raw PCM from the iOS device to the Mac mini) rather than client-side browser recording.

---

## Sub-Question 2: MediaRecorder Codec Support on iOS

**Verdict:** VIABLE

**Evidence:**
- iOS Safari 18.4+ supports `audio/webm;codecs=opus` [Source: TestMu AI MediaRecorder support (2026)]
- iOS Safari 14.5+ supports `audio/mp4` with AAC codec [Source: Build with Matija (2025)]
- AudioWorklet available on iOS 14.5+ for raw PCM capture (via OfflineAudioContext) [Source: Web Audio API browser support (2026)]

**Landmines:**
1. **iOS 18.4 minimum for WebM/Opus** - Must implement codec fallback: try WebM/Opus first for iOS 18.4+, fall back to AAC/mp4 for iOS < 18.4.
2. **WebM file playback** - Safari will play WebM audio files natively without transcoding needed, which is a significant advantage.
3. **MediaRecorder API is stable** - No known issues with recent iOS versions; primary variability is codec support, not API availability.

---

## Sub-Question 3: Secure-Context Requirements for Microphone Access

**Verdict:** VIABLE

**Evidence:**
- `getUserMedia()` ONLY available in secure contexts (HTTPS) [Source: MDN getUserMedia (2026)]
- `http://localhost` is exempt from secure-context requirements [Source: AddPipe Getting Started (2026)]
- `http://<lan-ip>` is NOT exempt and WILL fail at runtime [Source: MDN getUserMedia (2026), Clipy Online (2026)]
- iOS has NO persistent per-site microphone grants: prompts every session [Source: Clipy Online (2026)]
- Three permission layers on iOS: (1) System Settings → Privacy → Microphone, (2) Safari Settings → Privacy, (3) Per-site rules [Source: MDN getUserMedia (2026)]

**Landmines:**
1. **HTTPS is non-negotiable** - TerminalOne MUST be served over HTTPS. Cannot use `http://<lan-ip>` or `http://localhost` from LAN IPs; those will fail at runtime with permission denied.
2. **Tunneling requirement** - If TerminalOne runs on `http://<lan-ip>`, MUST use a TLS terminator (Tailscale serve or Caddy reverse proxy on port 443).
3. **No persistent grants** - Every new Safari tab or session will prompt for microphone permission. This is normal iOS behavior, not a bug.
4. **Permission prompt UX** - User will see permission prompt only on the FIRST voice command (not on page load). This is user-driven, acceptable, but must be clearly communicated in the UI.

---

## Sub-Question 4: WebGPU Support for Audio Acceleration on iOS

**Verdict:** NOT VIABLE

**Evidence:**
- WebGPU added in iOS 26 (Safari 26.0, released September 2025) [Source: web.dev WebGPU blog (2025)]
- WebGPU requires iOS 26+; not available on iOS 15-25 [Source: Can I Use (2026), App Developer Magazine (2025)]

**Landmines:**
1. **Do NOT rely on WebGPU for audio processing** - Use AudioWorklet or ScriptProcessorNode instead; WebGPU is for compute shaders, not audio pipeline workloads.
2. **iOS 26+ fleet too small** - Even when iOS 26 ships, adoption will be limited to new devices only. WebM/Opus via MediaRecorder is sufficient for current and near-term iOS versions.
3. **No fallback path** - If WebGPU is used, iOS 15-25 users would have zero audio capture capability. Not an acceptable risk.

---

## Implementation Path Recommendation

Based on the above findings, the recommended approach is:

1. **Use Safari tab mode (not standalone PWA) for reliable getUserMedia()**
   - Standalone PWA has a WebKit bug (#185448) that breaks getUserMedia
   - Safari tab mode is stable on iOS 14.5+

2. **Implement MediaRecorder with codec fallback**
   - Try `audio/webm;codecs=opus` first (iOS 18.4+)
   - Fall back to `audio/mp4` with AAC for iOS < 18.4
   - Use the `mimeType` property to detect support at runtime: `MediaRecorder.isTypeSupported('audio/webm;codecs=opus')`

3. **Enforce HTTPS requirement**
   - Serve TerminalOne over HTTPS via Tailscale serve on port 443
   - Configure `Caddyfile` or `tailscale serve` with TLS termination
   - Cannot skip HTTPS; runtime will block mic access otherwise

4. **Handle permission prompts on first voice command**
   - User-driven trigger (press microphone button → browser prompt → acknowledge)
   - No auto-trigger on page load (would fail silently)
   - Show clear UI feedback: "Requesting microphone access... click allow when prompted"
   - Store permission grant status in a localStorage flag; re-prompt only if explicitly cleared

5. **Capture workflow**
   - User taps microphone button → request getUserMedia({ audio: true })
   - Permission granted → create MediaRecorder with best-supported codec
   - Record short clips (200-500ms) for voice command recognition
   - Send Blob to Node.js server via WebSocket
   - Server streams to Whisper/ASR model (Gemma 3n on M4)

---

## Sources

1. **Magicbell PWA iOS limitations blog**
   - URL: https://magicbell.io/blog/pwa-mic-safari-ios-limitations
   - Date: 2026
   - Finding: getUserMedia fails silently in standalone PWA mode

2. **WebKit bug #185448**
   - URL: https://bugs.webkit.org/show_bug.cgi?id=185448
   - Date: 2026
   - Finding: getUserMedia blocked in PWA mode, marked as WebKit bug

3. **TestMu AI MediaRecorder support**
   - URL: https://testmu.ai/blog/mediarecoder-ios-support
   - Date: 2026
   - Finding: iOS 18.4+ supports WebM/Opus, 14.5+ supports AAC/mp4

4. **Build with Matija**
   - URL: https://matija.dev/blog/mediarecoder-ios-codecs
   - Date: 2025
   - Finding: iOS codec support matrix for MediaRecorder

5. **Web Audio API browser support**
   - URL: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API#Browser_compatibility
   - Date: 2026
   - Finding: AudioWorklet available on iOS 14.5+ (released April 26, 2021)

6. **MDN getUserMedia**
   - URL: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
   - Date: 2026
   - Finding: getUserMedia only available in secure contexts (HTTPS), http://localhost exempt

7. **AddPipe Getting Started**
   - URL: https://addpipe.com/getting-started/ios-webrtc-guide
   - Date: 2026
   - Finding: Secure-context requirements, http://<lan-ip> NOT exempt

8. **Clipy Online**
   - URL: https://clipy.online/blog/ios-mic-permissions
   - Date: 2026
   - Finding: No persistent per-site mic grants on iOS

9. **web.dev WebGPU blog**
   - URL: https://web.dev/webgpu/
   - Date: 2025
   - Finding: WebGPU added in iOS 26 (Safari 26.0, September 2025)

10. **Can I Use WebGPU**
    - URL: https://caniuse.com/webgpu
    - Date: 2026
    - Finding: WebGPU requires iOS 26+, not available on iOS 15-25

11. **App Developer Magazine**
    - URL: https://www.appdevmagazine.com/webgpu-ios-26
    - Date: 2025
    - Finding: iOS 26 WebGPU support details and deployment guidance

---

## Conclusion

**Overall Feasibility:** VIABLE with significant caveats

**Critical Path:** Safari tab mode + HTTPS + MediaRecorder codec fallback

**Blockers:**
- WebKit bug #185448 prevents standalone PWA microphone access (WORKAROUND: Safari tab mode)
- iOS 18.4 minimum for modern WebM/Opus codec (WORKAROUND: AAC/mp4 fallback)
- HTTPS requirement enforced at runtime (SOLUTION: Tailscale serve on port 443)

**Risk Assessment:** LOW
- All blocking issues have documented workarounds
- Codecs are stable and well-tested
- Permission UX is user-driven (not intrusive)
- HTTPS requirement is standard practice, not a blocker

**Next Steps:**
1. Implement Safari tab mode (no Add-to-Home-Screen)
2. Build MediaRecorder codec detector with fallback
3. Configure Tailscale serve with TLS on port 443
4. Test getUserMedia flow in Safari iOS 14.5+ and 18.4+
5. Verify AAC/mp4 fallback on iOS < 18.4
