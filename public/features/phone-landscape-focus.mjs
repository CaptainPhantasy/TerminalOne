/**
 * Chrome toggle + landscape focus (iPhone + iPad).
 *
 * Provides a persistent, always-on-screen floating toggle that collapses the
 * top header and bottom footer chrome to maximize terminal space. The on-screen
 * control bar (keybar) is NEVER hidden — it stays visible at the bottom on every
 * viewport size and orientation.
 *
 * The toggle is centered at the top and clamped inside the safe-area insets, so
 * a notch / Dynamic Island can never push it off-screen (the prior version used
 * `right: 12px`, which clipped off the right edge on notched devices in
 * landscape). It is a >=44pt touch target per Apple HIG.
 */
export function init(T1) {
  if (T1.device !== 'iphone' && T1.device !== 'ipad') return;

  T1.ui.addStyle(`
    /* Collapsed chrome hides header + footer + feature toolbar — but NEVER the
       keybar (control bar), which must stay visible at the bottom always. */
    body.t1-chrome-collapsed .terminal-header,
    body.t1-chrome-collapsed .terminal-footer,
    body.t1-chrome-collapsed .t1toolbar {
      display: none !important;
    }
    /* Always-on-screen chrome toggle. Centered + safe-area clamped so it can
       never sit off-screen or under a notch on any iPhone/iPad viewport. */
    .t1-chrome-fab {
      display: none;
      position: relative;
      top: auto;
      left: auto;
      transform: none;
      z-index: 350;
      min-width: 44px;
      min-height: 44px;
      padding: 8px 18px;
      font-size: 12px;
      line-height: 1;
      border-radius: 999px;
      background: var(--ui-elevated);
      border: 1px solid var(--ui-border);
      color: var(--ui-fg);
      box-shadow: none;
      opacity: 1; margin: 6px 8px; align-self: flex-start; flex-shrink: 0;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }
    .t1-chrome-fab:active { opacity: 1; }
    body[data-device="iphone"] .t1-chrome-fab,
    body[data-device="ipad"] .t1-chrome-fab {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
  `);

  const fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 't1-chrome-fab';
  document.querySelector('.app-shell').prepend(fab);

  // On short touch screens, secondary tools open in a dedicated sheet instead
  // of taking the terminal's remaining height. The original toolbar stays intact.
  const tools = document.createElement('button');
  tools.type = 'button';
  tools.className = 't1-tools-toggle';
  tools.textContent = 'Tools';
  tools.setAttribute('aria-controls', 't1toolbar');
  tools.setAttribute('aria-expanded', 'false');
  document.querySelector('.terminal-header').appendChild(tools);
  const toolbar = document.getElementById('t1toolbar');
  const done = document.createElement('button');
  done.type = 'button';
  done.className = 't1-tools-done';
  done.textContent = 'Done';
  toolbar.prepend(done);
  const backdrop = document.createElement('div');
  backdrop.className = 't1-tools-backdrop';
  document.querySelector('.app-shell').appendChild(backdrop);
  let toolsOpen = false;
  function setToolsOpen(open) {
    toolsOpen = open;
    document.body.classList.toggle('t1-tools-open', open);
    tools.setAttribute('aria-expanded', String(open));
    toolbar.setAttribute('role', open ? 'dialog' : 'toolbar');
    if (open) toolbar.setAttribute('aria-modal', 'true');
    else toolbar.removeAttribute('aria-modal');
    for (const child of document.querySelector('.app-shell').children) {
      if (child !== toolbar && child !== backdrop) child.inert = open;
    }
    if (open) done.focus(); else tools.focus();
    T1.fit();
  }
  tools.addEventListener('click', () => setToolsOpen(!toolsOpen));
  done.addEventListener('click', () => setToolsOpen(false));
  toolbar.addEventListener('click', e => {
    if (toolsOpen && e.target.closest('button') && e.target.closest('button') !== done) setToolsOpen(false);
  }, true);
  backdrop.addEventListener('click', () => setToolsOpen(false));
  document.addEventListener('keydown', e => {
    if (!toolsOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); setToolsOpen(false); }
    if (e.key === 'Tab') {
      const buttons = [...toolbar.querySelectorAll('button:not(:disabled)')];
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  const shortScreen = matchMedia('(max-height: 500px)');
  shortScreen.addEventListener('change', () => { if (toolsOpen) setToolsOpen(false); });
  T1.ui.addStyle(`
    .t1-tools-toggle, .t1-tools-done, .t1-tools-backdrop { display: none; }
    @media (max-height: 500px) {
      .t1-tools-toggle { display: inline-flex; align-items: center; }
      body:not(.t1-tools-open) .t1toolbar { display: none; }
      body.t1-tools-open .t1toolbar {
        display: flex !important; position: fixed; inset: 12px; z-index: 450;
        padding: 16px; border: 1px solid var(--ui-border); border-radius: 12px;
        align-content: flex-start; align-items: flex-start; overflow-y: auto;
      }
      body.t1-tools-open .t1-tools-done { display: inline-flex; align-items: center; }
      body.t1-tools-open .t1-tools-backdrop {
        display: block; position: fixed; inset: 0; background: rgba(0,0,0,.65); z-index: 440;
      }
    }
  `);

  let collapsed = false;
  function render() {
    document.body.classList.toggle('t1-chrome-collapsed', collapsed);
    if (collapsed) document.querySelector('.app-shell').prepend(fab);
    else document.querySelector('.terminal-header').appendChild(fab);
    fab.textContent = collapsed ? 'Show bars' : 'Hide bars';
    fab.setAttribute(
      'aria-label',
      collapsed ? 'Show header and footer' : 'Hide header and footer for more terminal space'
    );
    fab.setAttribute('aria-pressed', String(collapsed));
  }
  function setCollapsed(v) {
    collapsed = !!v;
    render();
    T1.fit();
  }

  fab.addEventListener('click', () => setCollapsed(!collapsed));
  render();

  // Surface for automated tests + other features.
  window.__terminalOneChrome = {
    fab,
    isCollapsed: () => collapsed,
    setCollapsed,
    toggle: () => setCollapsed(!collapsed)
  };
}
