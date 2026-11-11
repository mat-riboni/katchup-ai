import test from 'node:test';
import assert from 'node:assert/strict';
import { revealText } from '../web/app/reveal.mjs';
import { createLessonApi } from '../web/app/api/lesson.mjs';

test('progressive text preserves complete formulas, headings and the original whitespace', async () => {
  const text = '**Expected return**\nUse `G_t = R_{t+1} + γ G_{t+1}` to value this state.\n';
  const frames = [];
  await revealText(text, frame => frames.push(frame), undefined, { delay: 1 });
  assert.ok(frames.length > 3);
  assert.ok(frames[0].length < text.length);
  for (let i = 0; i < frames.length; i++) {
    assert.ok(text.startsWith(frames[i]));
    if (i) assert.ok(frames[i].length > frames[i - 1].length);
    assert.equal((frames[i].match(/`/g) || []).length % 2, 0);
    assert.equal((frames[i].match(/\*\*/g) || []).length % 2, 0);
  }
  assert.equal(frames.at(-1), text);
});

test('stopping a reveal prevents further chunks, including after a tab closes', async () => {
  const controller = new AbortController();
  const frames = [];
  const pending = revealText('First second third fourth', text => frames.push(text), controller.signal, { delay: 100 });
  assert.deepEqual(frames, ['First ']);
  controller.abort();
  await assert.rejects(pending, error => error.code === 'ABORTED');
  assert.deepEqual(frames, ['First ']);
});

test('zero delay gives a complete answer in one update', async () => {
  const frames = [];
  await revealText('One complete answer.', text => frames.push(text), undefined, { delay: 0 });
  assert.deepEqual(frames, ['One complete answer.']);
});

test('prepared answers stream again on each request without calling a provider', async () => {
  const api = createLessonApi({ revealDelay: 1, fetchImpl: () => assert.fail('Unexpected network request') });
  const lesson = { mode: 'prepared', slides: [{ context: '**Context**\nAn agent chooses an action.' }] };
  for (let pass = 0; pass < 2; pass++) {
    const frames = [];
    const answer = await api.streamAnswer({ lesson, slideNumber: 1, action: 'context', onText: text => frames.push(text) });
    assert.ok(frames.length > 2);
    assert.ok(frames[0].length < answer.text.length);
    assert.equal(frames.at(-1), lesson.slides[0].context);
  }
});
