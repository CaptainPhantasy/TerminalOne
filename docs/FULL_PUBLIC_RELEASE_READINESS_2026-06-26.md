# TerminalOne Full Public Release Readiness — 2026-06-26

## Scope

This roadmap answers: **what still needs to happen before TerminalOne is ready for a full public release beyond the current beta-ready state**.

It separates:
- **HIL** — Human-in-the-loop prerequisites or approvals
- **LLM** — Work the agent can execute once prerequisites exist

---

## Current baseline

- [EXECUTED] Beta review currently concludes **READY FOR BETA**: `docs/BETA_RELEASE_READINESS_2026-06-26.md`
- [EXECUTED] Beta evidence exists and includes passing tests plus install/uninstall/reinstall verification: `docs/BETA_RELEASE_EVIDENCE.md`
- [OBSERVED] No GitHub Actions workflows are present: `.github/**` missing from repo scan
- [OBSERVED] No `LICENSE*`, `SECURITY*`, `CONTRIBUTING*`, or `CODEOWNERS*` files are present in the repo scan
- [OBSERVED] `package.json` lacks public-distribution metadata such as `license`, `repository`, `homepage`, `bugs`, and `keywords`: `package.json:1-32`
- [OBSERVED] `SSOT/repository_report.json` is governance-generated and heuristic, not a trustworthy public-release summary: `SSOT/repository_report.json:1-45`

---

## Release verdict today

[OBSERVED] **Not yet ready for full public release**.

[OBSERVED] The app itself appears beta-ready, but the repo and release surface are still missing several public-facing trust, legal, and maintenance artifacts that are normal expectations for an unrestricted public launch.

---

## Ranked gaps for full public release

### P0 — Must be resolved before full public release

#### 1. Add an explicit open-source or source-available license
- **Owner:** HIL → LLM
- **Evidence:** [OBSERVED] No `LICENSE*` file in repo scan.
- **Why this matters:** Without a license, the public technically has no default permission to use, modify, or redistribute the code. That is a hard blocker for a serious public release.
- **HIL required:** Choose the license model (MIT / Apache-2.0 / GPL / source-available custom / proprietary public repo with explicit terms).
- **LLM follow-up:** Add `LICENSE`, align README wording, add `license` field to `package.json`, and ensure release notes match.

#### 2. Define public security disclosure policy
- **Owner:** HIL → LLM
- **Evidence:** [OBSERVED] No `SECURITY.md` in repo scan.
- **Why this matters:** Public releases invite vulnerability reports. Without a disclosure channel and support policy, the project looks unprepared and may receive unsafe disclosure by default.
- **HIL required:** Decide the disclosure destination (email, GitHub security advisories, issue-based disclosure, response expectations).
- **LLM follow-up:** Draft `SECURITY.md` and align it with repo settings and README.

#### 3. Establish minimum CI for public trust
- **Owner:** LLM
- **Evidence:** [OBSERVED] No `.github/**` workflows found.
- **Why this matters:** A public repo with no visible CI leaves outside users unable to trust that merges preserve installability and tests.
- **LLM work:** Add GitHub Actions to run at minimum:
  - install dependencies
  - `npm test`
  - shell syntax checks for `scripts/*.sh`
  - optional smoke artifact/log retention for failures
- **Acceptance:** Green CI badge path exists and PRs automatically verify.

#### 4. Re-run release evidence on a clean machine/session
- **Owner:** HIL + LLM
- **Evidence:** [OBSERVED] Current evidence is strong but mostly derived from the current machine/session logs in `/tmp` and local environment docs: `docs/BETA_RELEASE_EVIDENCE.md:18-77`
- **Why this matters:** Full public release needs confidence that onboarding works outside the builder's already-prepared environment.
- **HIL required:** Provide/authorize a clean-machine test surface (fresh macOS user, second Mac, or disposable VM).
- **LLM follow-up:** Re-run install, launch, uninstall, reinstall, and beta smoke flow from a clean environment and write a new receipt doc.

### P1 — Strongly recommended before public release

#### 5. Add contributor/support expectations
- **Owner:** HIL → LLM
- **Evidence:** [OBSERVED] No `CONTRIBUTING.md` or issue triage policy in repo scan.
- **Why this matters:** Once public, people will file issues, ask setup questions, and submit PRs. Without clear rules, maintainership cost rises immediately.
- **HIL required:** Decide whether external contributions are welcome now, later, or not at all.
- **LLM follow-up:** Add `CONTRIBUTING.md`, issue filing guidance, local test instructions, and support boundaries.

#### 6. Create a public-facing release narrative and changelog discipline
- **Owner:** LLM
- **Evidence:** [OBSERVED] `docs/RELEASE_NOTES.md` exists, but there is no canonical public changelog artifact like `CHANGELOG.md`; repo scan found no changelog file at root.
- **Why this matters:** Public users need a stable place to understand versions, major features, breaking changes, and release cadence.
- **LLM work:** Create `CHANGELOG.md` or elevate release notes into a durable public release log.

#### 7. Improve package/repo metadata for discoverability
- **Owner:** LLM
- **Evidence:** [OBSERVED] `package.json:1-32` lacks `license`, `repository`, `homepage`, `bugs`, and keywords.
- **Why this matters:** Public release should have machine-readable metadata for GitHub, package tooling, and search/discovery.
- **LLM work:** Add the missing fields and make the description less generic than `"Generic WebSocket terminal emulator"` if that still reflects the release story poorly.

#### 8. Validate real public onboarding docs end-to-end
- **Owner:** HIL + LLM
- **Evidence:** [OBSERVED] README is strong, but full public release requires outsider-proof onboarding, not builder-proof onboarding: `README.md:1-110`
- **Why this matters:** Public users will hit the README cold. Any missing assumptions become immediate support load.
- **HIL required:** A real cold reader/tester or a clean-user walkthrough approval.
- **LLM follow-up:** Turn the onboarding path into a scripted checklist and revise README from the observed failures.

### P2 — Valuable but not hard blockers

#### 9. Add repo ownership and review guardrails
- **Owner:** HIL → LLM
- **Evidence:** [OBSERVED] No `CODEOWNERS*` found in repo scan.
- **Why this matters:** Useful once external contributors arrive; less urgent if the repo remains single-maintainer for now.
- **HIL required:** Decide ownership boundaries.
- **LLM follow-up:** Add `CODEOWNERS` and branch-protection guidance.

#### 10. Re-run physical iPad install for the public claim set
- **Owner:** HIL + LLM
- **Evidence:** [OBSERVED] Known gap remains documented: `docs/BETA_RELEASE_EVIDENCE.md:42-55`
- **Why this matters:** Beta can tolerate emulator-backed confidence; full public release benefits from one final hands-on confirmation on the actual target device flow.
- **HIL required:** Physical iPad/iPhone access.
- **LLM follow-up:** Execute and document the exact A2HS path with screenshots/receipts.

---

## Minimum HIL set to unblock the rest

If you want the shortest path to "LLM, go finish public release readiness," the minimum human decisions are:

| ID | Human decision needed | Why it gates work |
|----|------------------------|-------------------|
| H1 | Choose license model | Required before `LICENSE` and package metadata can be correct |
| H2 | Choose security disclosure channel | Required before `SECURITY.md` can be correct |
| H3 | Decide contribution stance | Required before `CONTRIBUTING.md` can be honest |
| H4 | Provide/approve a clean-machine validation surface | Required to promote current local evidence into public-release proof |
| H5 | If desired, provide physical iPad/iPhone for final A2HS verification | Needed only if you want device-level public-release proof now |

Once H1-H4 are decided, the rest is mostly LLM-executable.

---

## LLM runbook after HIL decisions

### Phase 1 — Trust/legal baseline
1. Add `LICENSE`
2. Add `SECURITY.md`
3. Add `CONTRIBUTING.md`
4. Add package metadata (`license`, `repository`, `homepage`, `bugs`, `keywords`)

**Acceptance:** Repo has explicit legal terms, contact path for vulnerabilities, contributor expectations, and machine-readable public metadata.

### Phase 2 — Public automation baseline
1. Add GitHub Actions workflow(s)
2. Run `npm test` in CI
3. Run shell syntax checks in CI
4. Surface status badge(s) in README

**Acceptance:** Every PR and push receives visible automated verification.

### Phase 3 — Public proof refresh
1. Re-run install/uninstall/reinstall on a clean machine
2. Re-run README onboarding cold-start
3. Update `docs/BETA_RELEASE_EVIDENCE.md` with clean-machine receipts
4. If available, re-run physical iPad/iPhone A2HS proof

**Acceptance:** Public claims are backed by fresh receipts from outside the builder's warmed environment.

### Phase 4 — Public release packaging
1. Create `CHANGELOG.md` or canonical release log
2. Draft public release announcement copy
3. Tag the first public-ready release
4. Confirm README, release notes, and changelog agree on scope and support boundaries

**Acceptance:** Repo has a coherent public launch surface and a first release narrative.

---

## Suggested markdown/docs outputs for the next pass

- `LICENSE`
- `SECURITY.md`
- `CONTRIBUTING.md`
- `.github/workflows/ci.yml`
- `CHANGELOG.md`
- Updated `package.json`
- Refreshed `docs/BETA_RELEASE_EVIDENCE.md`
- Optional: `docs/FULL_PUBLIC_RELEASE_CHECKLIST.md`

---

## Hard truth summary

[OBSERVED] The **application** looks ready for outsiders to try.

[OBSERVED] The **repository/release surface** is not yet ready for a fully responsible public launch because it still lacks the legal, security, CI, and contribution scaffolding that public users reasonably expect.

[INFERENCE] If you want a quiet soft launch to a limited audience, you could plausibly proceed now.

[OBSERVED] If you want a true **full public release**, the P0 items above should be completed first.
