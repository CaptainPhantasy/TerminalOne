# TerminalOne Beta Release Readiness — 2026-06-26

Date: 2026-06-26
Scope: Current repository state for beta release readiness, with focus on install/uninstall reliability, PWA readiness, documentation honesty, and evidence quality.

## Verdict

**READY FOR BETA**

The previously blocking installer and uninstall issues have been corrected. The current application state is beta-ready, with two non-blocking cautions that should stay visible to anyone using this review for release decisions.

## Beta blockers

**None currently confirmed.**

The three prior release blockers from the earlier review are now cleared:

1. **Installer fail-closed behavior — cleared**
   - **Evidence:** `scripts/install-service.sh:68-100`
   - The launchd reload path now distinguishes "label still loaded" from a true bootstrap failure and exits on real errors instead of silently treating them as success.

2. **Uninstaller PATH cleanup — cleared**
   - **Evidence:** `scripts/uninstall-service.sh:38-46`
   - The cleanup now uses `grep -vF ... ; mv ...`, so removal still succeeds when the marked PATH line is the last remaining matching content.

3. **Overstated install/app-launch docs — cleared**
   - **Evidence:** `README.md:76-92`
   - The README now says the app goes to `/Applications` **or** `~/Applications`, describes launch as Chrome app mode, and derives the LAN interface from the default route instead of hardcoding `en0`.

## Remaining cautions (non-blocking)

### 1. SSOT repository report is still governance-generated and heuristic
- **Severity:** MEDIUM
- **Beta disqualifier:** No
- **Evidence:** `SSOT/repository_report.json:1-45`, `docs/BETA_RELEASE_EVIDENCE.md:1-77`
- **Issue:** `SSOT/repository_report.json` still reflects the deterministic governance bootstrap's coarse heuristic output, not the nuanced beta-readiness evidence. However, the repository now contains a durable evidence artifact at `docs/BETA_RELEASE_EVIDENCE.md` that explicitly documents test results, install/uninstall verification, and the known governance limitation.
- **Why it matters:** Anyone using only the SSOT report file could under-read product maturity. Anyone using the beta evidence doc gets the correct picture.

### 2. Physical iPad Add-to-Home-Screen was not re-run in this session
- **Severity:** LOW
- **Beta disqualifier:** No
- **Evidence:** `docs/BETA_RELEASE_EVIDENCE.md:42-55`
- **Issue:** Server-side PWA prerequisites and responsive behavior are verified, but the final hands-on Add-to-Home-Screen flow on a physical iPad remains documented as a known gap.
- **Why it matters:** This is a real but narrow gap in device-level confirmation, not a blocker to a beta label.

## Evidence of current readiness

### Automated tests
- **[EXECUTED]** `npm test`
- **Result:** PASS
- **Evidence:** `/tmp/t1_current_test.log`
- Highlights observed in this session:
  - Input guard tests: PASS
  - Smoke + functional tests: PASS
  - Feature verification: PASS
  - Feature-behavior checks: PASS
  - Responsive layout checks across iPad/iPhone viewports: PASS (`All responsive layout checks passed!`)

### Install / uninstall / reinstall verification
- **[EXECUTED]** Serial uninstall → verify clean removal → install → verify launcher/app/plist → launch via `t1` → uninstall again → verify clean removal → reinstall
- **Result:** PASS
- **Evidence:**
  - `/tmp/t1_verify_uninstall1.log`
  - `/tmp/t1_verify_install.log`
  - `/tmp/t1_verify_launch.log`
  - `/tmp/t1_verify_uninstall2.log`
  - `/tmp/t1_verify_reinstall.log`
- Launch verification output: `TerminalOne -> http://localhost:11001`

## Files reviewed with no significant current issue
- `.gitignore:1-14` — `.aider*` ignore remains benign.
- `public/index.html:11-14,1274-1282` — manifest, apple-touch-icon, theme-color, and guarded service-worker registration remain reasonable.
- `public/manifest.json:1-17` — standalone display, icons, and shortcuts remain coherent.
- `public/service-worker.js:1-33` — guarded offline shell caching remains simple and acceptable for beta.
- `scripts/t1.sh:1-32` — launcher behavior matches current README claims.
- `SSOT/TerminalOne_SSOT.md` — additive governance receipt entries only.

## Conclusion

As of the current repository state, TerminalOne is **beta release ready**.

The prior blockers are fixed, the test suite passes, and install/uninstall/reinstall behavior works end to end. The remaining issues are documentation/governance caveats, not application blockers.
