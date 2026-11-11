import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { parseLessonJson, LessonFileError } from '../web/app/lesson/load.mjs';
import { keywordsOf } from '../web/app/lesson/model.mjs';
import { createLessonApi, ROUTES } from '../web/app/api/lesson.mjs';

const raw = JSON.parse(await readFile(new URL('../web/lesson/lesson.json', import.meta.url), 'utf8'));
const lesson = parseLessonJson(raw);

test('all 62 PDF pages have English context, explanations, local glossary and an existing image', async () => {
  assert.equal(lesson.slides.length, 62);
  assert.equal(lesson.language, 'en');
  assert.equal(lesson.mode, 'prepared');
  assert.ok((await stat(new URL('../web/' + lesson.pdf, import.meta.url))).size > 0);
  const used = new Set();
  for (const slide of lesson.slides) {
    assert.ok(slide.context.length > 120 && slide.explain.length > 120, `Missing notes for ${slide.number}`);
    assert.equal(slide.transcript, '', 'Prepared notes must not masquerade as a transcript');
    assert.ok((await stat(new URL('../web/' + slide.image, import.meta.url))).size > 0);
    const keys = keywordsOf(lesson, slide);
    assert.ok(keys.length >= 3, `Glossary missing on page ${slide.number}`);
    for (const key of keys) {
      assert.ok(!used.has(key), 'Definitions must be scoped to individual slides');
      used.add(key);
      assert.equal(lesson.glossary[key].slideNumber, slide.number);
      assert.ok(lesson.glossary[key].definition.length > 20);
    }
    assert.ok(slide.references.every(n => n < slide.number && n > 0));
    assert.doesNotMatch(slide.context + slide.explain, /\b(della|delle|perché|questa|questo|lezione)\b/i);
  }
  assert.equal(used.size, 314);
});

test('all prepared answers and glossaries work offline even with a configured provider and server', async () => {
  let calls = 0;
  const api = createLessonApi({
    revealDelay: 0,
    getAi: () => ({ provider: 'openai', apiKey: 'unused' }),
    isOnline: () => false,
    fetchImpl: () => { calls++; throw new Error('Prepared lessons must not use the network'); },
  });
  const configured = { ...lesson, serverId: lesson.id };
  for (const slide of lesson.slides) {
    for (const action of ['context', 'explain']) {
      let shown;
      const answer = await api.streamAnswer({ lesson: configured, slideNumber: slide.number, action, health: { configured: true }, onText: t => { shown = t; } });
      assert.equal(answer.route, ROUTES.PREPARED);
      assert.equal(answer.text, slide[action]);
      assert.equal(shown, slide[action]);
    }
    const glossary = await api.refineGlossary({ lesson: configured, slideNumber: slide.number });
    assert.equal(glossary.entries.length, slide.keywords.length);
    assert.equal(glossary.origin, 'prepared');
  }
  assert.equal(calls, 0);
});

test('reject incomplete prepared data, unsafe source paths and future context references', () => {
  const change = fn => { const copy = structuredClone(raw); fn(copy); return () => parseLessonJson(copy); };
  assert.throws(change(d => { d.slides[3].context = ''; }), LessonFileError);
  assert.throws(change(d => { d.slides[3].glossary = []; }), LessonFileError);
  assert.throws(change(d => { d.slides[3].references = [5]; }), /earlier slides/);
  assert.throws(change(d => { d.slides[3].number = 20; }), /consecutive/);
  assert.throws(change(d => { d.pdf = '../../outside.pdf'; }), /relative/);
});

test('prepared route validates navigation and respects cancelled requests', async () => {
  const api = createLessonApi();
  for (const n of [0, 63, 2.5, NaN]) {
    await assert.rejects(api.streamAnswer({ lesson, slideNumber: n, action: 'context' }), RangeError);
  }
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(api.streamAnswer({ lesson, slideNumber: 1, action: 'context', signal: controller.signal }), e => e.code === 'ABORTED');
});

test('worked examples explain the PDF discrepancies with consistent calculations', () => {
  assert.equal(-2 - 0.5 - 0.25 - 0.25 - 0.125, -3.125);
  assert.match(lesson.slides[20].explain, /−3\.125/);
  assert.match(lesson.slides[20].explain, /not the expected state value/);
  const pub = 1 + 0.2 * 6 + 0.4 * 8 + 0.4 * 10;
  assert.equal(pub, 9.4);
  assert.match(lesson.slides[45].explain, /8\.4.*omits/s);
  assert.match(lesson.slides[45].explain, /9\.4/);
  assert.match(lesson.slides[42].explain, /negative sign is required/);
});
