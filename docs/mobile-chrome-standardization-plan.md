# Mobile Chrome / Control-Bar Standardization Plan

**Status:** COMPLETE (code + automated proof). One effect is owner-on-device verifiable only — see R4.
**Owner-gated:** No (non-governed working doc; lives in `docs/` per `.supercache/doc-management.json` Anti-Cruft Rule)
**Verified:** 2026-06-22 via `npm test` suites (receipts below). Each box checked ONLY after implement + verify.

## To-do list (checked only after implemented AND verified)

- [x] **R1 — Show-chrome toggle reachable on iPhone + iPad, any size** (never off the right edge)
- [x] **R2 — Control bar (keybar) always visible at the bottom** (even when chrome collapsed)
- [x] **R3 — 44pt touch targets** (toggle + keybar keys)
- [x] **R4 — Fullscreen / browser-chrome suppression** (PWA meta + first-gesture fullscreen + manual button) — see caveat
- [x] **ROB — Robustness: safe-area-aware fixed elements, `dvh` height, iPhone added to test harness**

## Problem (as reported)

1. "Show chrome" button **off the screen to the right** on some devices.
2. Must be **viewable on iPad and iPhone of any viewport size** (was iPhone-only, landscape-only).
3. **Bottom toolbar / control bar must always be visible** (was hidden in landscape focus).
4. **Force fullscreen** / hide the browser URL bar.

## Hard platform truths (kept honest)

- **The notch/off-screen-right repro is NOT reproducible in puppeteer-on-macOS** (safe-area insets are 0 there). The fix is structural (centered + `env(safe-area-inset-*)` clamp), proven on-screen across 16 emulated viewports; the literal notched-device case is owner-on-device.
- **Auto-force fullscreen on load is impossible** (gesture required) and **iPhone Safari does not support element fullscreen**. Delivered = PWA standalone meta tags + best-effort first-gesture `requestFullscreen()` + manual button. URL-bar suppression on iPhone = Add-to-Home-Screen (PWA), which `manifest.json` already declares.

## Files changed

1. `public/features/phone-landscape-focus.mjs` — rewritten: gate `iphone || ipad`; collapse hides header/footer/`.t1toolbar` only (keybar never); always-on-screen centered + safe-area-clamped 44pt toggle; `window.__terminalOneChrome` hook. Filename kept (asserted by `feature-behavior-test.js:204`).
2. `public/index.html` — `<head>` PWA meta tags (6-9); `.app-shell` `100dvh` (54-55); keybar key `min 44×44` (149-150, 168); first-gesture fullscreen IIFE (1224-1243).
3. `tests/responsive-test.js` — iPhone UA + 6 iPhone viewports + `checkIphone()` (R1/R2/R3 + collapse); iPad path now asserts toggle on-screen + 44pt; `RESP_DEVICE` subset filter.
4. `tests/feature-behavior-test.js` — `.t1-landscape-fab` → `.t1-chrome-fab` + assertion (199, 207).

## Completeness matrix

| Item | Status | Evidence |
|---|---|---|
| R1 toggle reachable iPhone+iPad | DONE | responsive 16/16: e.g. iPhone SE landscape "chrome toggle within viewport X (left=282, right=385, vw=667)"; iPad Pro 12.9 landscape "(left=632, right=734, vw=1366)" |
| R2 control bar always visible | DONE | iPhone 6/6 "control bar (keybar) visible" + "within viewport" + "STAYS visible when chrome collapsed" + "header hidden when collapsed"; iPad 10/10 "key bar within viewport" |
| R3 44pt touch targets | DONE | all 16: "chrome toggle >=44pt (103x44)" + "keybar key >=44pt tall (44)" |
| R4 fullscreen + PWA meta | DONE (effect owner-verify) | OBSERVED index.html:6-9 meta tags, :1224-1243 first-gesture fullscreen, manifest.json:6 standalone; page loads + runs cleanly (smoke/feature EXIT 0). iPhone URL-bar removal not provable in puppeteer — owner Add-to-Home-Screen check. |
| ROB safe-area / dvh / iPhone tests | DONE | OBSERVED index.html:54-55 dvh; feature safe-area `top: max(8px, env(safe-area-inset-top))`; iPhone matrix added + passing (responsive 9.94s) |

## Verification receipts

- `node tests/responsive-test.js` → "All responsive layout checks passed!" — 16 viewports (10 iPad + 6 iPhone), wall 9.94s.
- `RESP_DEVICE=iphone` → 6 iPhone viewports pass, wall 3.50s.
- `input-guard EXIT 0`, `smoke EXIT 0`, `feature EXIT 0`, `feature-behavior EXIT 0` (incl. "chrome toggle (.t1-chrome-fab) rendered on iphone"), wall 22.18s.
- Note: full `npm test` serial chain exceeds the 30s command cap; every constituent suite passes individually (above).

## Remaining (owner-on-device, not agent-provable)

- Confirm the toggle is physically reachable (clear of notch/Dynamic Island) on a real notched iPhone in landscape.
- Confirm URL bar is suppressed after Add-to-Home-Screen (PWA standalone) on iPhone.
