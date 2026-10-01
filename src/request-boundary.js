'use strict';
function isTrustedRequest(req, port) {
  const allowed = new Set([`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]);
  const host = (req.headers.host || '').toLowerCase();
  if (!allowed.has(host)) return false;
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = req.headers.origin;
  if (origin) {
    try { const url = new URL(origin); if (url.protocol !== 'http:' || !allowed.has(url.host.toLowerCase()) || url.host.toLowerCase() !== host) return false; }
    catch { return false; }
  }
  return true;
}
module.exports = { isTrustedRequest };
