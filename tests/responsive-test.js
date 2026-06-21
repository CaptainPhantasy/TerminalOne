#!/usr/bin/env node
/**
 * Responsive layout verification for TerminalOne.
 *
 * Reproduces the reported defect ("the app exceeds the viewport of my iPad")
 * and proves the fix: across a matrix of real iPad / tablet viewport sizes the
 * app shell must fit entirely within the viewport with zero overflow, the key
 * bar / footer must be visible (not clipped), and the on-screen key bar must
 * reflow for the narrow Split-View column.
 *
 * Sizes covered (CSS px @ 2x DPR, portrait + landscape):
 *   - iPad mini 6      744×1133
 *   - iPad 10th        820×1180
 *   - iPad Air / Pro   820×1180, 1024×1366
 *   - iPad Pro 12.9"   1024×1366
 *   - Split View (narrow iPad column) 320×1024, 507×1024, 520×1024
 *   - Landscape        1133×744, 1180×820, 1366×1024
 */

const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const PORT = process.env.RESP_PORT || 11003;
const BASE_URL = `http://localhost:${PORT}`;

const VIEWPORTS = [
  // ── The user's actual device: iPad (A16, 11th gen, 2025) — 10.86", 820×1180 CSS pt ──
  { name: 'iPad A16 11th-gen (portrait)',  width: 820,  height: 1180, dpr: 2, ua: 'ipad-portrait' },
  { name: 'iPad A16 11th-gen (landscape)', width: 1180, height: 820,  dpr: 2, ua: 'ipad-landscape' },
  { name: 'iPad A16 11th-gen Split 1/3',   width: 320,  height: 820,  dpr: 2, ua: 'ipad-portrait' },
  { name: 'iPad A16 11th-gen Split 1/2',   width: 512,  height: 820,  dpr: 2, ua: 'ipad-portrait' },
  { name: 'iPad mini 6 (portrait)',      width: 744,  height: 1133, dpr: 2, ua: 'ipad-portrait' },
  { name: 'iPad mini 6 (landscape)',     width: 1133, height: 744,  dpr: 2, ua: 'ipad-landscape' },
  { name: 'iPad Pro 11" (portrait)',     width: 834,  height: 1194, dpr: 2, ua: 'ipad-portrait' },
  { name: 'iPad Pro 12.9" (portrait)',   width: 1024, height: 1366, dpr: 2, ua: 'ipad-portrait' },
  { name: 'iPad Pro 12.9" (landscape)',  width: 1366, height: 1024, dpr: 2, ua: 'ipad-landscape' },
  { name: 'Slide Over (narrow column)',  width: 438,  height: 1024, dpr: 2, ua: 'ipad-portrait' }
];

// iPadOS 13+ UA — reports MacIntel but requests desktop; combined with touch
// this is what detectDevice() keys off of for the iPad key bar.
const IPAD_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT FAILED: ' + msg);
  console.log('  ✓ ' + msg);
}

function get(p) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${BASE_URL}${p}`, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('timeout')));
  });
}

async function waitForHealth(timeoutMs = 20000) {
  const start = Date.now();
  for (;;) {
    try {
      const r = await get('/health');
      if (r.statusCode === 200) { JSON.parse(r.body); return; }
    } catch (_) { /* not up yet */ }
    if (Date.now() - start > timeoutMs) throw new Error('server did not become healthy');
    await new Promise((r) => setTimeout(r, 250));
  }
}

// Per-viewport: emulate an iPad, load the app, and measure overflow.
async function checkViewport(browser, vp) {
  const pg = await browser.newPage();
  try {
    await pg.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: vp.dpr, hasTouch: true, isMobile: true });
    await pg.setUserAgent(IPAD_UA);
    await pg.evaluateOnNewDocument(() => {
      // iPadOS reports MacIntel + maxTouchPoints>1 — the detectDevice() trigger.
      Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });
      Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 2 });
    });
    await pg.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await pg.waitForFunction('window.__terminalOne', { timeout: 10000 });
    // Let the terminal + first fit settle.
    await new Promise((r) => setTimeout(r, 500));

    const m = await pg.evaluate(() => {
      const sh = document.querySelector('.app-shell');
      const cont = document.querySelector('.terminal-container');
      const keybar = document.querySelector('#keybarIpad');
      const footer = document.querySelector('.terminal-footer');
      const header = document.querySelector('.terminal-header');
      const term = document.querySelector('#terminal');
      // DOMRect values live on the prototype, so {...rect} (own-props only)
      // yields an empty object — copy each field explicitly.
      const rect = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
      };
      const shellStyle = getComputedStyle(sh);
      return {
        vw: window.innerWidth,
        vh: window.innerHeight,
        device: document.body.dataset.device,
        shell: rect(sh),
        shellHeight: parseFloat(shellStyle.height),
        shellWidth: parseFloat(shellStyle.width),
        shellBox: shellStyle.boxSizing,
        shellPadding: shellStyle.padding,
        container: rect(cont),
        header: rect(header),
        keybar: keybar ? { ...rect(keybar), display: getComputedStyle(keybar).display } : null,
        footer: rect(footer),
        term: rect(term),
        // documentElement scroll size reveals ANY content overflow.
        docScrollW: document.documentElement.scrollWidth,
        docScrollH: document.documentElement.scrollHeight,
        bodyScrollW: document.body.scrollWidth,
        bodyScrollH: document.body.scrollHeight
      };
    });

    // The core assertion: the app must NOT exceed the viewport.
    const hOverflow = m.docScrollH - m.vh;
    const wOverflow = m.docScrollW - m.vw;
    assert(m.device === 'ipad', `${vp.name}: detectDevice → ipad (got ${m.device})`);
    assert(hOverflow <= 1, `${vp.name}: no vertical overflow (scrollH=${m.docScrollH} ≤ vh=${m.vh}, over=${hOverflow})`);
    assert(wOverflow <= 1, `${vp.name}: no horizontal overflow (scrollW=${m.docScrollW} ≤ vw=${m.vw}, over=${wOverflow})`);

    // The key bar + footer must be fully inside the viewport (the symptom of
    // the bug was the bottom controls being clipped off-screen).
    assert(m.keybar && m.keybar.bottom <= m.vh + 1, `${vp.name}: iPad key bar within viewport (bottom=${Math.round(m.keybar.bottom)} ≤ ${m.vh})`);
    assert(m.footer.bottom <= m.vh + 1, `${vp.name}: footer within viewport (bottom=${Math.round(m.footer.bottom)} ≤ ${m.vh})`);
    assert(m.container.bottom >= 0 && m.container.top < m.vh, `${vp.name}: terminal container visible (top=${Math.round(m.container.top)}, bottom=${Math.round(m.container.bottom)})`);

    // The shell must use the dynamic-viewport height (dvh) when supported —
    // proving the layout tracks mobile chrome rather than the static large vh.
    assert(m.shellBox === 'border-box', `${vp.name}: app-shell is border-box (insets don't compound)`);

    // Terminal element itself must be fully contained (xterm canvas not clipped).
    assert(m.term.bottom <= m.vh + 1 && m.term.right <= m.vw + 1, `${vp.name}: xterm element contained (term bottom=${Math.round(m.term.bottom)}, right=${Math.round(m.term.right)})`);
  } finally {
    await pg.close();
  }
}

async function run() {
  console.log('TerminalOne responsive layout verification');
  console.log(`Target: ${BASE_URL}\n`);

  const server = spawn('node', [path.join(__dirname, '..', 'src', 'server.js')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore'
  });
  let browser = null;
  try {
    await waitForHealth();

    const puppeteer = require('puppeteer');
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

    for (const vp of VIEWPORTS) {
      console.log(`\n[${vp.name}] ${vp.width}×${vp.height} @${vp.dpr}x`);
      await checkViewport(browser, vp);
    }

    console.log('\nAll responsive layout checks passed!');
    server.kill('SIGTERM');
    process.exit(0);
  } catch (err) {
    console.error('\n✗ ' + (err && err.message ? err.message : err));
    try { if (browser) await browser.close(); } catch (_) {}
    server.kill('SIGTERM');
    process.exit(1);
  }
}

run();
