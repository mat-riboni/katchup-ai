// Lesson model shared by the UI and the adapter. Pure functions, no DOM.
//
// Lesson shape:
// { id, title, course, source: 'sample' | 'file', serverId?, autoGlossary?, partialSlide?,
//   glossary: { [key]: { term, definition, aliases: string[], formula?, origin?, slideNumber? } },
//   slides: [{ number, title, bullets: string[], formula?, figure?, image?, transcript, keywords?: string[] }],
//   sampleAnswers?: { [slideNumber]: { context, explain } } }

/** Inline keyword markup used in slide text: [[key|visible text]] or [[key]]. */
export const MARK = /\[\[([A-Za-z0-9_-]+)(?:\|([^\]]+))?\]\]/g;

export const plain = value => String(value ?? '').replace(MARK, (_, key, text) => text || key);

export const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const slugify = value => String(value).normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'term';

/** Visible text of a slide (title, bullets, formula), without markup. */
export function slideText(slide) {
  return [slide.title, ...(slide.bullets || []), slide.formula || ''].map(plain).join('\n');
}

const aliasesOf = entry => {
  const list = [entry.term, ...(entry.aliases || [])].filter(Boolean).map(a => a.trim()).filter(Boolean);
  return [...new Set(list.map(a => a.toLowerCase()))];
};

/** Regex that matches whole-word occurrences of any alias of the given glossary keys. */
export function aliasMatcher(lesson, keys) {
  const pairs = [];
  for (const key of keys) {
    const entry = lesson.glossary?.[key];
    if (entry) for (const alias of aliasesOf(entry)) pairs.push([alias, key]);
  }
  if (!pairs.length) return null;
  pairs.sort((a, b) => b[0].length - a[0].length);
  const lookup = new Map(pairs);
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${pairs.map(([a]) => escapeRegExp(a)).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  return { re, keyFor: text => lookup.get(text.toLowerCase()) };
}

/**
 * Glossary keys that appear on a slide, in reading order. A key counts when it is
 * marked up explicitly ([[key|text]]) or when one of its aliases appears in the text.
 * Only these keys are listed in the glossary panel for this slide.
 */
export function keywordsOf(lesson, slide) {
  if (!slide || !lesson?.glossary) return [];
  // Prepared page glossaries include diagram labels and section prerequisites,
  // which cannot reliably be recovered by matching a PDF image's extracted text.
  if (lesson.mode === 'prepared') return (slide.keywords || []).filter(key => lesson.glossary[key]);
  const found = new Map();
  const raw = [slide.title, ...(slide.bullets || [])].join('\n');
  for (const match of raw.matchAll(MARK)) {
    if (lesson.glossary[match[1]] && !found.has(match[1])) found.set(match[1], match.index);
  }
  const candidates = slide.keywords?.length ? slide.keywords : Object.keys(lesson.glossary);
  const matcher = aliasMatcher(lesson, candidates);
  if (matcher) {
    const text = [slide.title, ...(slide.bullets || [])].map(plain).join('\n');
    for (const match of text.matchAll(matcher.re)) {
      const key = matcher.keyFor(match[1]);
      if (key && !found.has(key)) found.set(key, match.index + 0.5);
    }
  }
  return [...found.entries()].sort((a, b) => a[1] - b[1]).map(([key]) => key);
}

/**
 * Splits a slide string into parts for rendering: plain text and keyword hits.
 * Returns [{ text, key? }]. The UI escapes `text` and wraps keyword parts in buttons.
 */
export function keywordParts(lesson, value, keys) {
  const parts = [];
  const matcher = aliasMatcher(lesson, keys);
  const pushPlain = text => {
    if (!text) return;
    if (!matcher) { parts.push({ text }); return; }
    let last = 0;
    for (const match of text.matchAll(matcher.re)) {
      const key = matcher.keyFor(match[1]);
      if (!key) continue;
      if (match.index > last) parts.push({ text: text.slice(last, match.index) });
      parts.push({ text: match[1], key });
      last = match.index + match[1].length;
    }
    if (last < text.length) parts.push({ text: text.slice(last) });
  };
  let last = 0;
  for (const match of String(value).matchAll(MARK)) {
    pushPlain(value.slice(last, match.index));
    const key = match[1];
    const text = match[2] || key;
    parts.push(lesson.glossary?.[key] && keys.includes(key) ? { text, key } : { text });
    last = match.index + match[0].length;
  }
  pushPlain(String(value).slice(last));
  return parts;
}

/**
 * The material an AI action may read for slide N. This is the single place that
 * enforces the time boundary: slides after N are never included.
 *  - context (Katchup: what was said before this slide): slides 1..N-1 with their transcript, plus slide N's
 *    visible text for orientation (not its transcript).
 *  - explain: slides 1..N-1 visible text, slide N with its transcript.
 *  - glossary: slides 1..N with transcript (definitions as given so far).
 */
export function contextWindow(lesson, slideNumber, action) {
  const n = Number(slideNumber);
  if (!Number.isInteger(n) || n < 1 || n > lesson.slides.length) throw new RangeError('Slide out of range');
  const transcriptThrough = action === 'context' ? n - 1 : n;
  const slides = lesson.slides.slice(0, n).map(slide => ({
    number: slide.number,
    title: plain(slide.title),
    text: [...(slide.bullets || []).map(plain), slide.formula ? `Formula: ${slide.formula}` : ''].filter(Boolean).join(' | '),
    transcript: action === 'explain' && slide.number < n ? '' : (slide.number <= transcriptThrough ? (slide.transcript || '') : ''),
  }));
  return { title: lesson.title, currentSlide: n, transcriptThrough, slides };
}

/** Splits a plain block of slide text into bullet-sized lines. */
export function textToBullets(text) {
  return String(text || '').split(/\n+|(?<=[.;])\s+(?=[A-Z0-9(])/)
    .map(line => line.replace(/^[-*•]\s*/, '').trim()).filter(Boolean).slice(0, 8);
}
