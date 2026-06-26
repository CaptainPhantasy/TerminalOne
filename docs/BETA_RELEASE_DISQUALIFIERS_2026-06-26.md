# TerminalOne Beta Release Review — Disqualifiers

Date: 2026-06-26
Scope: `.gitignore`, `README.md`, `SSOT/TerminalOne_SSOT.md`, `SSOT/repository_report.json`, `public/index.html`, `scripts/install-service.sh`, `scripts/t1.sh`, `scripts/uninstall-service.sh`

## Verdict

**REQUEST_CHANGES**

The change set has release-blocking issues in the installer/release-evidence path.

## Ranked disqualifiers

### 1. Silent LaunchAgent install failure is treated as success
- **Severity:** HIGH
- **Beta disqualifier:** **Yes**
- **Evidence:** `scripts/install-service.sh:77-81`
- **Issue:** `launchctl bootstrap` is wrapped in `if ! ...; then echo "service already loaded"; fi`, with stderr discarded. Any bootstrap failure — malformed plist, permissions, launchd rejection, unrelated runtime error — is collapsed into the benign "already loaded" path. The follow-up `launchctl kickstart -k ... || true` also suppresses failure.
- **Why this blocks beta:** The installer can print a successful install while the always-on service was never actually installed or restarted. That breaks the primary install promise and creates a false-positive setup state for users.

### 2. Repository SSOT now presents narrative claims as verified release evidence
- **Severity:** HIGH
- **Beta disqualifier:** **Yes**
- **Evidence:** `SSOT/repository_report.json:35-49`
- **Issue:** The report now sets `_verified: true` and `_verified_by: "agent code review"`, while the `_evidence` block contains prose assertions (`"EXECUTED: ..."`) rather than durable artifact paths, receipts, or reproducible references stored in-repo. The file now acts as a release-readiness attestation without repository-grounded proof.
- **Why this blocks beta:** A beta qualification report cannot rely on unverifiable narrative evidence embedded directly into the report being certified. This is evidence laundering: the file asserts verification rather than pointing to it.

### 3. Uninstaller PATH cleanup can fail to remove the line it added
- **Severity:** HIGH
- **Beta disqualifier:** **Yes**
- **Evidence:** `scripts/uninstall-service.sh:38-43`
- **Issue:** Cleanup uses `grep -vF "$MARK" > "$tmp" && mv "$tmp" "$rc"`. When the marked PATH line is the only matching content to remove, `grep -vF` returns exit status `1` for "no selected lines", so the `mv` never runs. The stale PATH edit can remain in the shell rc file.
- **Why this blocks beta:** README and repository metadata now sell the install as fully reversible. This code path can leave shell state behind, so the uninstall guarantee is not trustworthy.

## Other material findings

### 4. Dock/Launchpad launch claims overpromise what the app bundle actually is
- **Severity:** MEDIUM
- **Beta disqualifier:** No
- **Evidence:** `scripts/install-service.sh:135-155`, `README.md:76-82`, `SSOT/repository_report.json:24-27`
- **Issue:** The generated bundle is marked `LSUIElement` (`true`) and immediately delegates to the `t1` shell launcher, which then opens Chrome in app mode (`scripts/t1.sh:25-30`). That is not the same as a persistent native TerminalOne app presence in the Dock, and the Dock-facing product copy is overstated.
- **Why it matters:** The no-terminal launch path may still work, but the current docs and SSOT copy describe a stronger native-app experience than the code actually provides.

### 5. `/Applications` install claim is stronger than the implementation
- **Severity:** MEDIUM
- **Beta disqualifier:** No
- **Evidence:** `README.md:79-82`, `scripts/install-service.sh:129-133`
- **Issue:** README says TerminalOne.app is installed into `/Applications`, but the installer falls back to `~/Applications` when `/Applications` is not writable.
- **Why it matters:** This is a documentation mismatch in a user-facing install flow.

### 6. iPad instructions hardcode `en0` as the LAN interface
- **Severity:** LOW
- **Beta disqualifier:** No
- **Evidence:** `README.md:88-90`
- **Issue:** `ipconfig getifaddr en0` is presented as the path to the Mac's LAN address. That is not universally the active network interface.
- **Why it matters:** The README presents this as a straightforward path, but it can fail on machines whose active interface is not `en0`.

## Files reviewed with no significant issue
- `.gitignore:1-20` — `.aider*` ignore looks benign.
- `SSOT/TerminalOne_SSOT.md:154-160` — appended receipt log entries are additive and not independently problematic.
- `public/index.html:11-14,1274-1283` — manifest/apple-touch-icon/theme-color plus guarded service-worker registration are reasonable on their own.

## Required actions before beta qualification
1. Make `install-service.sh` fail closed on real `launchctl bootstrap`/`kickstart` errors and only suppress the specific already-loaded condition.
2. Fix uninstall PATH cleanup so the marked line is removed even when the result file becomes empty.
3. Replace `SSOT/repository_report.json` narrative assertions with durable evidence references or drop the `_verified` claim.
4. Downgrade or correct Dock/`/Applications` install claims to match actual behavior.
