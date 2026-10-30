#!/usr/bin/env node
/**
 * Unit tests for the input/dictation guard.
 *
 * Drives the red-green-refactor fix for:
 *  - typing lag / lost characters on quick keystrokes
 *  - iOS dictate-to-text double/triple-echo from duplicated or overlapping partials
 */

import { InputGuard } from '../public/input-guard.mjs';
import assert from 'assert';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function test(name, fn) {
  try {
    await fn();
    console.log('  ✓ ' + name);
  } catch (err) {
    console.error('\n✗ ' + name);
    throw err;
  }
}

function makeGuard(opts = {}) {
  const sent = [];
  const g = new InputGuard({
    send: (d) => sent.push(d),
    identicalDedupeMs: opts.identicalDedupeMs ?? 500,
  });
  return { g, sent };
}

async function run() {
  console.log('InputGuard unit tests (TDD)');

  await test('single char is sent immediately', () => {
    const { g, sent } = makeGuard();
    g.onData('a');
    assert.deepStrictEqual(sent, ['a']);
    g.dispose();
  });

  await test('two chars quickly are both sent, no overwrite', async () => {
    const { g, sent } = makeGuard();
    g.onData('a');
    await sleep(5);
    g.onData('b');
    assert.deepStrictEqual(sent, ['a', 'b'], 'lost/overwritten characters');
    g.dispose();
  });

  await test('typing whole word sends each character', async () => {
    const { g, sent } = makeGuard();
    for (const ch of 'echo') {
      g.onData(ch);
      await sleep(5);
    }
    assert.deepStrictEqual(sent, ['e', 'c', 'h', 'o']);
    g.dispose();
  });

  await test('identical multi-char events within dedupe window are dropped', async () => {
    const { g, sent } = makeGuard({ identicalDedupeMs: 200 });
    g.onData('hello world');
    await sleep(20);
    g.onData('hello world');
    await sleep(20);
    g.onData('hello world');
    await sleep(20);
    assert.deepStrictEqual(sent, ['hello world'], 'repeated STT phrase was not deduped');
    g.dispose();
  });

  await test('repeated single characters are never deduped (real typing)', async () => {
    const { g, sent } = makeGuard({ identicalDedupeMs: 500 });
    g.onData('a');
    await sleep(20);
    g.onData('a');
    await sleep(20);
    g.onData('a');
    assert.deepStrictEqual(sent, ['a', 'a', 'a'], 'legitimate repeated keystrokes were dropped');
    g.dispose();
  });

  await test('dictation cumulative partials produce final phrase once', async () => {
    const { g, sent } = makeGuard();
    g.onData('this');
    await sleep(10);
    g.onData('this is');
    await sleep(10);
    g.onData('this is a');
    await sleep(10);
    g.onData('this is a test');
    await sleep(10);
    assert.strictEqual(sent.join(''), 'this is a test', 'screen text duplicated/truncated');
    assert.ok(!sent.some((s) => s.includes('this this')), 'prefix duplicated');
    g.dispose();
  });

  await test('dictation suffix overlap produces final phrase once', async () => {
    const { g, sent } = makeGuard();
    g.onData('hello world');
    await sleep(40);
    g.onData('world peace');
    await sleep(10);
    assert.strictEqual(sent.join(''), 'hello world peace', 'suffix overlap not suppressed');
    g.dispose();
  });

  await test('repeating the same final phrase does not re-send it', async () => {
    const { g, sent } = makeGuard();
    g.onData('done');
    await sleep(50);
    g.onData('done');
    await sleep(50);
    g.onData('done');
    await sleep(50);
    assert.deepStrictEqual(sent, ['done']);
    g.dispose();
  });

  await test('control character resets overlap baseline', () => {
    const { g, sent } = makeGuard();
    g.onData('hello');
    g.onData('\n');
    g.onData('world');
    assert.deepStrictEqual(sent, ['hello', '\n', 'world']);
    g.dispose();
  });

  await test('pasting printable text sends it once', () => {
    const { g, sent } = makeGuard();
    g.onData('paste this sentence');
    assert.deepStrictEqual(sent, ['paste this sentence']);
    g.dispose();
  });

  // ── Regression: dictation doubling ──────────────────────────────────────
  // v1 bug: a single-char event (space, first char, IME marker) between the
  // last multi-char partial and the compositionend finalization called
  // _resetBaseline(), zeroing _lastSent. The full phrase then arrived with no
  // baseline to diff against → sent in full → DOUBLED. v2 appends single chars
  // to a rolling buffer instead, so the finalization is recognized as
  // already-sent and suppressed.

  await test('dictation: single char between partial and final does NOT double', async () => {
    const { g, sent } = makeGuard();
    // Partials stream in cumulatively.
    g.onData('hello');
    await sleep(10);
    g.onData('hello world');
    await sleep(10);
    // iOS fires a single char (space / first char of finalization) — this was
    // the bug trigger in v1.
    g.onData(' ');
    await sleep(10);
    // compositionend re-fires the full phrase.
    g.onData('hello world');
    const joined = sent.join('');
    assert.strictEqual(joined, 'hello world ', 'dictation finalization was doubled');
    assert.ok(!joined.includes('hello worldhello'), 'full phrase re-sent after single char');
    g.dispose();
  });

  await test('dictation: compositionend full phrase suppressed after word partials', async () => {
    const { g, sent } = makeGuard();
    // Word-by-word partials (non-cumulative, space-delimited).
    g.onData('hello ');
    await sleep(10);
    g.onData('hello world');
    await sleep(10);
    // Finalization re-fires the complete phrase.
    g.onData('hello world');
    const joined = sent.join('');
    assert.strictEqual(joined, 'hello world', 'finalization doubled after cumulative partials');
    g.dispose();
  });

  await test('single char between dictation partials does not break suffix logic', async () => {
    const { g, sent } = makeGuard();
    g.onData('foo');
    await sleep(10);
    g.onData('b');            // single char — appends to buffer, no reset
    await sleep(10);
    g.onData('ar');           // next partial
    await sleep(10);
    g.onData('foobar');       // finalization
    const joined = sent.join('');
    assert.strictEqual(joined, 'foobar', 'interleaved single char broke delta');
    g.dispose();
  });

  // ── Regression: keystrokes eaten on long messages ────────────────────────
  // Reported defect: "when messages start to get long ... all key strokes have
  // to be entered twice". A platform delivers several keys in one event (IME,
  // predictive keyboard, fast iOS input). The substring/overlap subtraction
  // then treated such a burst as text it had already sent — so once the line
  // contained the same letters, the burst was dropped and the keys vanished.

  await test('2-key burst whose letters appear earlier in the line is still sent', async () => {
    const { g, sent } = makeGuard();
    for (const ch of 'the thing is') g.onData(ch);
    g.onData('th');           // two keys landing in one input event
    g.onData(' t');           // space + t, both already in the line
    assert.strictEqual(sent.join(''), 'the thing is' + 'th' + ' t', 'keystroke burst swallowed by earlier text');
    g.dispose();
  });

  await test('3-key burst past the tail of the line is not truncated', async () => {
    const { g, sent } = makeGuard();
    for (const ch of 'the quick brown') g.onData(ch);
    g.onData('own');          // overlaps the last three chars of "brown"
    assert.strictEqual(sent.join(''), 'the quick brown' + 'own', 'overlap subtraction ate typed keys');
    g.dispose();
  });

  await test('dictation finalization still suppressed after the burst fix', async () => {
    const { g, sent } = makeGuard();
    for (const ch of 'the thing is ') g.onData(ch);
    g.onData('the thing is that');   // cumulative dictation partial
    g.onData('the thing is that');   // compositionend re-fire
    assert.strictEqual(sent.join(''), 'the thing is that', 'long phrase sent twice');
    g.dispose();
  });

  await test('short dictation finalization is suppressed after an interleaved space', () => {
    for (const phrase of ['ls', 'pwd']) {
      const { g, sent } = makeGuard();
      g.onData(phrase);
      g.onData(' ');
      g.onData(phrase);
      assert.strictEqual(sent.join(''), phrase + ' ');
    }
  });

  await test('known keyboard input preserves repeated bursts of every length', () => {
    for (const text of ['ab', 'pwd', 'echo', 'hello world', '🐈']) {
      const { g, sent } = makeGuard();
      g.onData(text, { source: 'keyboard' });
      g.onData(text, { source: 'keyboard' });
      assert.strictEqual(sent.join(''), text + text);
    }
  });

  await test('known keyboard input preserves cumulative-looking bursts and repeated commands', () => {
    const { g, sent } = makeGuard();
    for (const text of ['x', 'xy', 'ls', ' ', 'ls']) {
      g.onData(text, { source: 'keyboard' });
    }
    assert.strictEqual(sent.join(''), 'xxyls ls');
  });

  await test('paste is never deduplicated against previous input', () => {
    const { g, sent } = makeGuard();
    g.onData('hello world');
    g.onData('hello world', { source: 'paste' });
    assert.strictEqual(sent.join(''), 'hello worldhello world');
  });

  await test('single-character dictation partials refresh the window after a long session', () => {
    const { g, sent } = makeGuard();
    let now = 10000;
    g._now = () => now;
    for (const ch of 'hello') { g.onData(ch); now += 10; }
    g.onData('hello world');
    assert.strictEqual(sent.join(''), 'hello world');
  });

  await test('expired text is not joined to a new dictation partial', () => {
    const { g, sent } = makeGuard();
    let now = 10000;
    g._now = () => now;
    g.onData('old');
    now += 4000;
    g.onData('n');
    g.onData('new');
    assert.strictEqual(sent.join(''), 'oldnew');
  });

  await test('repeated control keys and input after a deliberate key are never swallowed', () => {
    const { g, sent } = makeGuard();
    g.onData('\u001b[A');
    g.onData('\u001b[A');
    g.onData('hello');
    g.send('\r');
    g.onData('hello');
    assert.strictEqual(sent.join(''), '\u001b[A\u001b[Ahello\rhello');
  });

  await test('separate compositions can deliberately repeat the same phrase', () => {
    const { g, sent } = makeGuard();
    for (let i = 0; i < 2; i++) {
      g.beginComposition();
      g.onData('ls', { source: 'composition' });
      g.onData('ls');
    }
    assert.strictEqual(sent.join(''), 'lsls');
  });

  await test('backspace clears the previous dictation baseline', () => {
    const { g, sent } = makeGuard();
    g.onData('hello');
    g.onData('\u007f');
    g.onData('hello');
    assert.strictEqual(sent.join(''), 'hello\u007fhello');
  });

  console.log('\nAll input-guard tests passed!');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
