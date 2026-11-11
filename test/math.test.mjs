import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMath } from '../web/app/ui/math.mjs';
import { markdown } from '../web/app/ui/render.mjs';
import { parseLessonJson } from '../web/app/lesson/load.mjs';
import { readFile } from 'node:fs/promises';

const raw = JSON.parse(await readFile(new URL('../web/lesson/lesson.json', import.meta.url), 'utf8'));

test('formulas use mathematical scripts, fractions and summation limits, not code', () => {
  assert.match(renderMath('Pᵃₛₛ′'), /<msubsup>/);
  assert.match(renderMath('Gₜ = Σₖ₌₀∞ γᵏ Rₜ₊ₖ₊₁'), /<munderover>/);
  assert.match(renderMath('M / (1 − γ)'), /<mfrac>/);
  assert.match(renderMath('vπ(s)'), /<msub><mi>v<\/mi><mi>π/);
  assert.match(renderMath('Pπ'), /<msup><mi>P<\/mi><mi>π/);
  assert.match(renderMath('(I − γP)⁻¹'), /<msup><mrow><mo>\(/);
  const rendered = markdown('The value is `vπ(s)`.\n\n`vπ(s) = Eπ[Gₜ | Sₜ = s]`');
  assert.equal((rendered.match(/<math /g) || []).length, 2);
  assert.doesNotMatch(rendered, /<code>/);
  assert.match(rendered, /display="block"/);
});

test('formula rendering cannot inject HTML or attributes', () => {
  const html = renderMath('"><img src=x onerror=alert(1)>');
  assert.doesNotMatch(html, /<img|onerror="/);
  assert.match(html, /&quot;/);
  assert.doesNotMatch(markdown('`<script>alert(1)</script>`'), /<script>/);
});

test('the prepared deck includes local definitions for the letters in its equations', () => {
  const lesson = parseLessonJson(raw);
  const symbols = n => new Map(lesson.slides[n - 1].symbols.map(s => [s.symbol, s.definition]));
  for (const key of ['v', 's', 'E', 'Gₜ', 'Sₜ', 'Rₜ₊₁', 'γ', 't']) assert.ok(symbols(25).has(key), key);
  for (const key of ['Pᵃₛₛ′', 'Rᵃₛ', 'π', 'a', 's′', 'γ']) assert.ok(symbols(40).has(key), key);
  for (const key of ['Hₜ', 'h', 'b(h)', 'sᵢ', 'i', 'Oₜ']) assert.ok(symbols(58).has(key), key);
  for (const slide of lesson.slides) {
    assert.equal(new Set(slide.symbols.map(s => s.symbol)).size, slide.symbols.length);
    assert.ok(slide.symbols.every(s => s.definition.length > 20));
    assert.doesNotMatch(JSON.stringify(slide), /\u2014/);
  }
});

test('malformed symbol data is rejected before rendering', () => {
  const data = structuredClone(raw);
  data.slides[24].symbols = [{ symbol: 'γ', definition: '' }];
  assert.throws(() => parseLessonJson(data), /symbols need/);
});
