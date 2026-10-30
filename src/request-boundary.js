'use strict';

// The listener remains on loopback. These origins belong to separately
// authenticated HTTPS proxies that preserve the external Host header.
function createRequestBoundary(port, trustedOrigins = '') {
  const allowedOrigins = new Set([
    `http://localhost:${port}`, `http://127.0.0.1:${port}`, `http://[::1]:${port}`
  ].map((origin) => new URL(origin).origin));
  for (const entry of trustedOrigins.split(',').map((value) => value.trim()).filter(Boolean)) {
    let url;
    try { url = new URL(entry); } catch { /* rejected below */ }
    if (!url || url.protocol !== 'https:' || url.hostname.includes('*') || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('TERMINALONE_TRUSTED_ORIGINS must contain exact HTTPS origins, separated by commas (for example https://terminal.example.com).');
    }
    allowedOrigins.add(url.origin);
  }
  const allowedHosts = new Set([...allowedOrigins].map((origin) => new URL(origin).host));
  return (req) => {
    const host = req.headers.host;
    if (typeof host !== 'string' || !allowedHosts.has(host.toLowerCase())) return false;
    if (req.headers['sec-fetch-site'] === 'cross-site') return false;
    const origin = req.headers.origin;
    if (origin !== undefined) {
      if (typeof origin !== 'string') return false;
      try {
        const url = new URL(origin);
        if (url.origin !== origin || !allowedOrigins.has(url.origin) || url.host !== host.toLowerCase()) return false;
      } catch { return false; }
    }
    return true;
  };
}

function isTrustedRequest(req, port) {
  return createRequestBoundary(port)(req);
}

module.exports = { isTrustedRequest, createRequestBoundary };
