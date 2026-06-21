# TerminalOne SSOT (Single Source of Truth)
**Created:** 2026-06-17T14:07:01-04:00
**Last Updated:** 2026-06-17T14:20:00-04:00
**Governance:** .supercache/ v1.7.0

> **Compliance Notice:** This file must match the structure at
> `.supercache/templates/ssot-template.md`. This is the authoritative
> document for architecture and programmatic change facts of **TerminalOne**.

---

## Authority

This document is the **single source of truth** for architecture and programmatic change facts of TerminalOne. All other documents must be treated as **potentially flawed** unless their facts are confirmed here.

When a fact in any other document contradicts this SSOT, the SSOT wins. If the SSOT itself is wrong, it is corrected via the **Verification Sweep Protocol** below, not by editing other documents to match.

---

## Verification Sweep Protocol (required on every read)

When an agent reads this SSOT to perform a task:

1. Perform a **line-by-line verification review** of the sections relevant to the current task.
2. For each verified fact, append a verification entry to the **Verification Log** at the bottom of this file with:
   - Timestamp (`YYYY-MM-DD HH:MM TZ`)
   - Section/line reference
   - Evidence source (code path + line, command + output, build log, runtime behavior, etc.)
   - Confidence = 100%
3. If any fact cannot be verified to 100% confidence:
   - Mark it **UNVERIFIED** inline in the section where it appears
   - Add an entry to `Issues/TerminalOne_ISSUES.md` to track the discrepancy
   - Do NOT proceed on the assumption that the fact is true

### Positive Reinforcement (required)

For each fact verified at 100% confidence during a sweep, emit the acknowledgement:

```
Verified as fact (100%): <fact summary>
```

This pattern is deliberate — it reinforces evidence-first thinking and makes the verification record auditable after the fact.

---

## Current State

**Phase:** Active development — terminal infrastructure cloned
**Status:** Active
**Last Agent Session:** 2026-06-17T14:20:00-04:00

---

## Architecture Facts

### Stack

- **Primary language**: JavaScript (CommonJS)
- **Runtime**: Node.js >=16
- **Framework**: Express HTTP + WebSocket (ws) + node-pty + xterm.js
- **Module system**: CommonJS

### Key architectural choices

- **Single-port HTTP+WS server**: Express and WebSocket share port 11001, avoiding cross-origin and secondary-port issues.
- **Real PTY via node-pty**: Spawns the user's default shell in a pseudoterminal so interactive programs work in the browser.
- **Generic terminal surface**: No harness registry, no launcher UI. The project is intentionally a stripped terminal emulator, not harness-launcher.

---

## Key Decisions

| Date | Decision | Rationale | Decided By |
|---|---|---|---|
| 2026-06-17T14:20:00-04:00 | Port 11001 claimed for TerminalOne | Adjacent to harness-launcher (11000) for lineage; avoids forbidden ports 3000/5173 and existing claims. | Agent |
| 2026-06-17T14:20:00-04:00 | Clone only terminal part of harness-launcher | User instruction: clone terminal part, not harnesses or launcher. | Douglas |
| 2026-06-19T00:00:00-04:00 | Responsive layout: dvh/dvw + safe-area on .app-shell | iPad/tablet viewport overflow caused by double-counted safe-area insets (body padding + 100vh). Fixed by moving insets to the element that owns height. | Douglas/Agent |
<!-- Decisions are append-only. When a decision is superseded, add a new row with the -->
<!-- superseding decision and link back to the old one. Never edit historical rows. -->

---

## Dependencies

| Dependency | Version | Purpose | Criticality |
|---|---|---|---|
| <!-- e.g., next --> | <!-- 16.1.0 --> | <!-- App framework --> | <!-- critical / supporting / dev-only --> |

---

## Deployment

| Environment | URL / Location | Status | Last Deploy |
|---|---|---|---|
| production | <!-- e.g., https://example.com --> | <!-- live / down / maintenance --> | <!-- YYYY-MM-DD --> |
| staging | <!-- e.g., https://staging.example.com --> | <!-- --> | <!-- --> |
| local | <!-- e.g., localhost:{PORT} --> | <!-- dev --> | <!-- N/A --> |

---

## Known Patterns & Lessons

<!-- Proven solutions to recurring problems in this project. Apply immediately when you hit the trigger. -->

| Pattern | Trigger | Fix | Confidence |
|---|---|---|---|
| viewport-safe-area-double-count | App overflows/clips bottom controls on mobile | Don't put env(safe-area-inset-*) on body AND 100vh on a child. With viewport-fit=cover the body already spans the notch zones; apply insets on the element that owns height (border-box), and use 100dvh/dvw with vh/vw fallback. | 1.0 |

---

## Verification Log (append-only)

| Timestamp | Section / Line | Fact Verified | Evidence Source | Confidence |
|---|---|---|---|
| 2026-06-17T14:20:00-04:00 | Current State / Architecture Facts | Project is now a Node.js CommonJS terminal emulator using Express+ws+node-pty+xterm.js on port 11001 | `/Volumes/SanDisk1Tb/TerminalOne/FLOYD.md`, `/Volumes/SanDisk1Tb/SSOT/port-registry.json` | 100% |
| 2026-06-17T14:20:00-04:00 | Key Decisions | Port 11001 claimed and terminal part cloned without harness/launcher code | `/Volumes/SanDisk1Tb/SSOT/port-registry.json`, agent edits | 100% |
| 2026-06-19T00:00:00-04:00 | Architecture Facts / Responsive layout | App shell no longer overflows the viewport on any iPad size; uses dvh/dvw (vh/vw fallback) with safe-area insets on .app-shell (border-box). Verified across 10 tablet viewports incl. iPad A16 11th-gen (820×1180) portrait/landscape/Split View via tests/responsive-test.js (puppeteer): scrollH/W ≤ vh/vw, key bar + footer within viewport, terminal contained. | tests/responsive-test.js (npm test), public/index.html:23-63,146-152 | 100% |

---

## Change Log (append-only)

- 2026-06-17T14:07:01-04:00 — Initialized SSOT.
- 2026-06-17T14:20:00-04:00 — Cloned terminal part from harness-launcher; claimed port 11001; updated FLOYD.md and SSOT architecture facts.
- 2026-06-19T00:00:00-04:00 — Fixed iPad/tablet viewport overflow (app exceeded viewport). Root cause: double-counted safe-area insets (body padding + 100vh on .app-shell under viewport-fit=cover). Moved insets onto .app-shell (border-box), switched to 100dvh/dvw with vh/vw fallback, removed redundant keybar bottom inset, hardened #terminal overflow, added tablet/Split-View/landscape-with-keyboard media queries. Added tests/responsive-test.js (10 viewports incl. iPad A16 11th-gen); wired into npm test. Full suite green.

<!-- Append new entries BELOW this comment line, in chronological order. -->
<!-- Never edit or remove existing entries — this is the authoritative change history. -->

---

## Mandatory execution contract
For EACH requested item:
1) Show exact action taken
2) Show direct evidence (file/line/command/output)
3) Show verification result
4) Mark status only after proof

## Forbidden behaviors
- Declaring "done" without evidence
- Collapsing multiple requested items into one vague summary
- Skipping failed steps without explicit blocker report

## Required output structure
A) Requested items checklist
B) Per-item evidence ledger
C) Verification receipts
D) Completeness matrix (item -> done/blocked -> evidence)

## Hard gate
If any requested item has no evidence row, final status MUST be INCOMPLETE.

- 2026-06-17T14:07:02-04:00 — Governance orchestrator verified bootstrap and workers. Receipt: /Users/douglastalley/.omp/governance/receipts/TerminalOne-orchestrator-20260617-140701.json

- 2026-06-17T14:18:58-04:00 — Governance orchestrator verified bootstrap and workers. Receipt: /Users/douglastalley/.omp/governance/receipts/TerminalOne-orchestrator-20260617-141858.json
