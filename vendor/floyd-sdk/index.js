'use strict';

const DEFAULT_FLOYD_CORE_URL = 'http://127.0.0.1:41414';

class FloydApiError extends Error {
  constructor(method, path, status, payload) {
    const detail = typeof payload === 'string' ? payload : JSON.stringify(payload);
    super(`${method} ${path} -> ${status}: ${detail}`);
    this.name = 'FloydApiError';
    this.method = method;
    this.path = path;
    this.status = status;
    this.payload = payload;
  }
}

/** CommonJS snapshot of the dependency-free @floyd/sdk request boundary. */
class FloydClient {
  constructor({ baseUrl = DEFAULT_FLOYD_CORE_URL, token, fetch: fetchImpl = globalThis.fetch }) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.tokenSource = token;
    this.fetchImpl = fetchImpl.bind(globalThis);
  }

  async token() {
    return typeof this.tokenSource === 'function' ? this.tokenSource() : this.tokenSource;
  }

  async request(method, path, body, signal) {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${await this.token()}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' })
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal
    });
    const text = await response.text();
    let payload = text;
    if (text) {
      try { payload = JSON.parse(text); } catch (_) { /* Preserve exact non-JSON Core body. */ }
    }
    if (!response.ok) throw new FloydApiError(method, path, response.status, payload);
    return payload;
  }

  health(signal) {
    return this.request('GET', '/api/health', undefined, signal);
  }
}

module.exports = { DEFAULT_FLOYD_CORE_URL, FloydApiError, FloydClient };
