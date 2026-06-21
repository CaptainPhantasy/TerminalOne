/**
 * Phone landscape full-width terminal focus mode (iPhone).
 *
 * When an iPhone rotates to landscape, hide header/status/footer/key bar and
 * expand the terminal to the full viewport. A floating button restores chrome.
 */
export function init(T1) {
  if (T1.device !== 'iphone') return;

  T1.ui.addStyle(`
    body[data-device="iphone"].t1-landscape-focus .app-shell {
      height: 100dvh; grid-template-rows: 1fr;
    }
    body[data-device="iphone"].t1-landscape-focus .terminal-header,
    body[data-device="iphone"].t1-landscape-focus .terminal-footer,
    body[data-device="iphone"].t1-landscape-focus .keybar,
    body[data-device="iphone"].t1-landscape-focus .featurebar {
      display: none !important;
    }
    body[data-device="iphone"].t1-landscape-focus .terminal-container {
      padding: 0; height: 100dvh;
    }
    .t1-landscape-fab {
      display: none;
      position: fixed;
      right: 12px; top: 12px;
      z-index: 300;
      padding: 8px 10px;
      font-size: 11px;
      border-radius: 6px;
      background: var(--ui-elevated);
      border: 1px solid var(--ui-border);
      color: var(--ui-fg);
      opacity: 0.7;
    }
    body[data-device="iphone"].t1-landscape-focus .t1-landscape-fab { display: block; }
  `);

  const fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 't1-landscape-fab';
  fab.textContent = 'Show chrome';
  fab.setAttribute('aria-label', 'Restore header and footer');
  document.body.appendChild(fab);

  function isLandscape() {
    return Math.abs(window.orientation) === 90 || window.innerWidth > window.innerHeight;
  }

  function update() {
    if (isLandscape()) document.body.classList.add('t1-landscape-focus');
    else document.body.classList.remove('t1-landscape-focus');
  }

  fab.addEventListener('click', () => {
    document.body.classList.remove('t1-landscape-focus');
    T1.fit();
  });

  window.addEventListener('orientationchange', update, { passive: true });
  window.addEventListener('resize', update, { passive: true });
  update();

  window.__terminalOneLandscapeFocus = { update, fab, isLandscape };
}
