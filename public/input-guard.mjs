/**
 * InputGuard — eliminate iOS dictate-to-text and IME echo duplication while
 * keeping normal typing perfectly crisp.
 *
 * Design:
 *  - Single characters are sent immediately (no debounce, no dedupe).
 *  - Multi-character strings are deduplicated against the last identical event
 *    and against the last-sent baseline for a generous window (500ms). This
 *    catches iOS dictation re-firing the same phrase as the recognizer settles.
 *  - Multi-character strings suppress any overlap with the last-sent string so
 *    cumulative partials ("a" → "ab" → "abc") append only the new tail.
 *  - Control sequences reset the overlap baseline and are sent immediately.
 */
export class InputGuard {
  constructor({ send, identicalDedupeMs = 500 }) {
    this._send = send;
    this.identicalDedupeMs = identicalDedupeMs;
    this._lastSent = '';
    this._lastSentTime = 0;
    this._lastEvent = { data: '', time: 0 };
    this._now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  }

  onData(data) {
    if (!data || data.length === 0) return;

    const now = this._now();

    // Drop duplicate events that xterm.js / iOS sometimes fires twice for one
    // physical input. Never deduplicate single characters (normal typing).
    if (data.length > 1 && data === this._lastEvent.data && now - this._lastEvent.time < this.identicalDedupeMs) {
      return;
    }
    this._lastEvent = { data, time: now };

    const printable = [...data].every((c) => c.charCodeAt(0) >= 0x20);
    if (!printable) {
      this._sendRaw(data);
      this._resetBaseline();
      return;
    }

    if (data.length === 1) {
      this._sendRaw(data);
      this._resetBaseline();
      return;
    }

    // If we just sent this exact multi-char string, don't send it again.
    if (data === this._lastSent && now - this._lastSentTime < this.identicalDedupeMs) {
      return;
    }

    const delta = this._deltaFromLast(data);
    this._sendRaw(delta);
    this._lastSent = data;
    this._lastSentTime = now;
  }

  /** Raw send for deliberate key-bar input. */
  send(data) {
    this._sendRaw(data);
    this._resetBaseline();
  }

  dispose() {
    /* no timers to clear */
  }

  _resetBaseline() {
    this._lastSent = '';
    this._lastSentTime = 0;
  }

  _deltaFromLast(data) {
    if (!this._lastSent) return data;

    // Prefix extension: recognizer grew the phrase at the end.
    if (data.startsWith(this._lastSent)) return data.slice(this._lastSent.length);

    // Suffix overlap: recognizer revised a few characters at the start.
    const max = Math.min(this._lastSent.length, data.length);
    for (let len = max; len > 0; len--) {
      if (this._lastSent.endsWith(data.slice(0, len))) {
        return data.slice(len);
      }
    }
    return data;
  }

  _sendRaw(data) {
    if (data) this._send(data);
  }
}
