/* TerminalOne service worker — offline shell only. */
const CACHE_NAME = 'terminalone-shell-v2';
const OFFLINE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/input-guard.mjs',
  '/node_modules/@xterm/xterm/css/xterm.css',
  '/node_modules/@xterm/xterm/lib/xterm.mjs',
  '/node_modules/@xterm/addon-fit/lib/addon-fit.mjs',
  '/node_modules/@xterm/addon-web-links/lib/addon-web-links.mjs'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !OFFLINE_ASSETS.includes(url.pathname)) return;
  // Always try the server first so an installed PWA receives input fixes.
  // Only shell assets may fall back to cache; a failed API call or module
  // request must never receive index.html in place of its actual response.
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(event.request);
        if (response.ok) {
          try {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(event.request, response.clone());
          } catch { /* Cache limits must not hide a successful online response. */ }
        }
        return response;
      } catch {
        try {
          const cache = await caches.open(CACHE_NAME);
          return await cache.match(event.request) || Response.error();
        } catch { return Response.error(); }
      }
    })()
  );
});
