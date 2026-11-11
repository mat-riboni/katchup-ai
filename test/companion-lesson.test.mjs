import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { keywordsOf, keywordParts, contextWindow } from '../web/app/lesson/model.mjs';
import { sampleLesson } from '../web/app/lesson/sample.mjs';
import { extractGlossary, withSlideGlossary } from '../web/app/lesson/glossary.mjs';
import { parseLessonJson, loadLesson, LessonFileError } from '../web/app/lesson/load.mjs';
import { createLiveSession, heardLesson } from '../web/app/live.mjs';

test('sample lesson: 6-8 slides, each with transcript, keywords and both sample answers', () => {
  const lesson = sampleLesson();
  assert.ok(lesson.slides.length >= 6 && lesson.slides.length <= 8);
  for (const slide of lesson.slides) {
    assert.ok(slide.transcript.length > 100);
    assert.ok(keywordsOf(lesson, slide).length >= 1, `slide ${slide.number} has keywords`);
    assert.ok(lesson.sampleAnswers[slide.number].context && lesson.sampleAnswers[slide.number].explain);
  }
});

test('sample Katchup answers only cite earlier slides', () => {
  const lesson = sampleLesson();
  for (const slide of lesson.slides) {
    const cited = [...lesson.sampleAnswers[slide.number].context.matchAll(/slides? (\d+)(?:–(\d+))?/g)].flatMap(m => [m[1], m[2]].filter(Boolean).map(Number));
    for (const n of cited) assert.ok(n < slide.number, `slide ${slide.number} context cites slide ${n}`);
  }
});

test('glossary lists only the current slide keywords, in reading order', () => {
  const lesson = sampleLesson();
  assert.deepEqual(keywordsOf(lesson, lesson.slides[0]), ['loss', 'gd', 'param', 'lr', 'gradient', 'momentum']);
  assert.ok(!keywordsOf(lesson, lesson.slides[1]).includes('loss'));
});

test('keywordParts marks explicit markup and aliases, nothing else', () => {
  const lesson = sampleLesson();
  const parts = keywordParts(lesson, 'The [[gd|gradient descent]] uses the learning rate.', ['gd', 'lr']);
  assert.deepEqual(parts.filter(p => p.key).map(p => [p.text, p.key]), [['gradient descent', 'gd'], ['learning rate', 'lr']]);
});

test('context window stops at the current slide', () => {
  const ctx = contextWindow(sampleLesson(), 3, 'context');
  assert.equal(ctx.slides.length, 3);
  assert.equal(ctx.slides[2].transcript, '');
  assert.throws(() => contextWindow(sampleLesson(), 99, 'context'), RangeError);
});

test('live session plays words, moves to the next slide, pauses and resumes', async () => {
  const lesson = { slides: [{ transcript: 'one two' }, { transcript: 'three' }] };
  const seen = [];
  const session = createLiveSession(lesson, { speed: 400, onChange: (s, reason) => seen.push([reason, s.slide, s.word, s.playing]) });
  await new Promise(r => setTimeout(r, 120));
  assert.deepEqual(seen.map(e => e[0]), ['word', 'word', 'slide', 'word', 'ended']);
  assert.ok(seen.slice(0, -1).every(e => e[3] === true), 'playing while running');
  assert.deepEqual(session.snapshot(), { slide: 2, word: 1, words: 1, playing: false, speed: 400, ended: true, recent: 'three' });
  const paused = createLiveSession(lesson, { playing: false });
  assert.equal(paused.snapshot().playing, false);
  paused.play(); assert.equal(paused.snapshot().playing, true);
  paused.pause(); assert.equal(paused.snapshot().playing, false);
  paused.destroy();
});

test('auto glossary uses only what was heard so far', () => {
  const lesson = {
    title: 't', glossary: {}, autoGlossary: true, slides: [
      { number: 1, title: 'Heuristic search', bullets: ['An admissible heuristic never overestimates'], transcript: 'An admissible heuristic is one that never overestimates the remaining cost. LATER_WORDS admissible heuristic means something else.' },
      { number: 2, title: 'Future', bullets: ['Admissible heuristic revisited'], transcript: 'FUTURE: admissible heuristic means something else later.' },
    ],
  };
  const h = heardLesson(lesson, 1, 11); // up to "...the remaining cost."
  const entries = extractGlossary(h, 1);
  assert.ok(entries.some(e => /admissible heuristic/i.test(e.term)));
  for (const entry of entries) assert.doesNotMatch(entry.definition, /FUTURE|LATER_WORDS/);
  const v = withSlideGlossary(h, 1);
  assert.ok(keywordsOf(v, v.slides[0]).length >= 1);
  const sample = sampleLesson();
  assert.equal(withSlideGlossary(sample, 1), sample, 'a lesson with its own glossary is left as is');
});

test('lesson.json: backend manifest format plus image, bullets and glossary', () => {
  const lesson = parseLessonJson({
    id: 'algo-3', title: 'Heuristic search', course: 'Algorithms',
    slides: [
      { number: 1, title: 'Path cost', text: 'g(n): path cost so far. Uniform cost search expands the lowest g.', image: 'slides/slide-01.png', transcript: 'We call g of n the cost so far.' },
      { number: 2, title: 'Heuristics', bullets: ['h(n) estimates the rest'], transcript: 'The heuristic estimates the remaining cost.' },
    ],
    glossary: [{ term: 'Heuristic', definition: 'An estimate of the remaining cost.', aliases: ['heuristics'] }],
  });
  assert.equal(lesson.id, 'algo-3');
  assert.equal(lesson.slides[0].image, 'lesson/slides/slide-01.png');
  assert.deepEqual(lesson.slides[0].bullets, ['g(n): path cost so far.', 'Uniform cost search expands the lowest g.']);
  assert.equal(lesson.autoGlossary, false);
  assert.equal(parseLessonJson({ title: 'x', slides: [{ title: 'a', text: 'b', transcript: 'c' }] }).autoGlossary, true);
});

test('lesson.json validation: clear messages, safe image paths', () => {
  assert.throws(() => parseLessonJson([]), LessonFileError);
  assert.throws(() => parseLessonJson({ slides: [] }), /at least one slide/);
  assert.throws(() => parseLessonJson({ slides: [{ text: 'x' }] }), /Slide 1 needs a "title"/);
  assert.throws(() => parseLessonJson({ slides: [{ title: 'x' }] }), /"text"/);
  assert.throws(() => parseLessonJson({ slides: [{ title: 'x', text: 'y', image: '../../etc/passwd.png' }] }), /relative path/);
  assert.throws(() => parseLessonJson({ slides: [{ title: 'x', text: 'y', image: 'https://evil.example/a.png' }] }), /relative path/);
});

test('loader falls back to the sample lesson when the file is missing or invalid', async () => {
  assert.equal((await loadLesson(async () => new Response('', { status: 404 }))).lesson.id, 'katchup-sample');
  const bad = await loadLesson(async () => new Response('{ nope', { status: 200 }));
  assert.equal(bad.lesson.id, 'katchup-sample');
  assert.match(bad.error, /lesson\.json could not be used/);
  const ok = await loadLesson(async () => new Response(JSON.stringify({ title: 'Mine', slides: [{ title: 'a', text: 'b', transcript: 'c' }] }), { status: 200 }));
  assert.equal(ok.lesson.title, 'Mine');
});

test('no Italian strings in the frontend', async () => {
  const root = new URL('../web/', import.meta.url).pathname;
  const files = ['index.html', 'styles.css'];
  const walk = async dir => {
    for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
      const rel = join(dir, entry.name);
      if (entry.isDirectory()) await walk(rel); else if (/\.(mjs|html|css)$/.test(entry.name)) files.push(rel);
    }
  };
  await walk('app');
  const italian = /\b(della|delle|degli|nella|perché|questa|questo|anche|sono|lezione|spiega|carica|riprova|errore|chiave)\b/i;
  for (const file of files) {
    const text = await readFile(join(root, file), 'utf8');
    const hit = text.match(italian);
    assert.equal(hit, null, `${file} contains "${hit?.[0]}"`);
  }
});
