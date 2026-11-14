# TerminalOne workspace
Primary workflow: /Volumes/Storage/Legacy_Design_Studio/frontend-design/SKILL.md.
Supplemental critique: open-design/craft/anti-ai-slop.md.
Direction: Apple glass interpreted as restrained translucent navigation, crisp SF system typography, generous control targets and an uninterrupted terminal. No neon, decorative gradients, emoji, marketing cards or fabricated metrics.
Tokens: porcelain #eef1f5, ink #202832, glass #ffffffcc, line #cbd2dc, blue #175cbb, terminal #14171b. System sans for controls; existing monospace for shell.
Desktop: persistent workspace sidebar, terminal and browser split horizontally, full available width including widescreens.
Tablet: compact rail, terminal and browser vertically stacked, overlay tools drawer.
Phone: bottom workspace navigation, one task surface at a time, full-width tools sheet.
Navigation: Terminal, browser tabs and Agent browser in one workspace list; existing features moved into searchable tools drawer.
Four named motions: drawer reveal (open/close, 260ms); surface switch (select workspace, 220ms); control press (pointer down/up, 180ms); active tab feedback (selection, 200ms). Easing cubic-bezier(.2,.8,.2,1). Reduced motion: all transitions/animations disabled, immediate state changes, no parallax or continuous motion.
Browser model: isolated server-side Chromium contexts for human and agent tabs. Human tabs private by default, grants of view or control explicit and revocable. Agent browser runs headless whether its live view is visible or hidden. Existing personal browser tabs cannot be captured without a browser extension; workspace tabs are real Chromium pages with independent cookies.

Modern Web Guidance review (2026-11-14): https://github.com/GoogleChrome/modern-web-guidance-src.
Applied the published navigation-drawer and browser-ui-theming guidance: native modal dialog, accessible name, aria-controls/expanded state, Escape/focus restoration, native inputs/selects, visible scrollbars and resizable connection textarea. Added progressive discrete open/close transitions with @starting-style and immediate reduced-motion fallback. The native scroll-snap swipe drawer recipe was not adopted: this design uses a fixed-duration tools sheet and separate persistent navigation.
Source copies and retrieval dates are in evidence/guidance-*.md.
