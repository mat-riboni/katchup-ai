import { escapeRegExp, plain, slugify } from './model.mjs';
import { STOP_WORDS, sentences, truncate, words } from './text.mjs';

// Local glossary extraction for lessons that come without a glossary.
// No AI: candidate terms are phrases visible on the slide that the lecturer actually
// used; the definition is the lecturer's own sentence, from this slide or earlier ones.

const DEFINING = /\b(is|are|means|refers to|stands for|called|we call|known as|defined as)\b/i;

function candidates(slide) {
  const text = [slide.title, ...(slide.bullets || [])].map(plain).join(' \n ');
  const out = new Map();
  for (const line of text.split(/[\n,;:()]/)) {
    const tokens = words(line);
    for (let n = 3; n >= 1; n--) {
      for (let i = 0; i + n <= tokens.length; i++) {
        const gram = tokens.slice(i, i + n);
        if (STOP_WORDS.has(gram[0]) || STOP_WORDS.has(gram[n - 1])) continue;
        if (gram.some(w => /^\d+$/.test(w))) continue;
        if (n === 1 && gram[0].length < 4) continue;
        const phrase = gram.join(' ');
        if (!out.has(phrase)) out.set(phrase, n);
      }
    }
  }
  return out;
}

// Singular and plural match each other: "nodes" on the slide finds "node" in the transcript.
const singular = phrase => (phrase.length > 4 && /[^s]s$/.test(phrase) ? phrase.slice(0, -1) : phrase);
const phraseRe = phrase => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(singular(phrase))}(?:s|es)?(?![\\p{L}\\p{N}])`, 'giu');

/**
 * Returns up to `max` glossary entries for slide N, using transcripts of slides 1..N only.
 * Each entry: { key, term, definition, origin: 'extracted', slideNumber }.
 */
export function extractGlossary(lesson, slideNumber, max = 5) {
  const slide = lesson.slides[slideNumber - 1];
  if (!slide) return [];
  const available = lesson.slides.slice(0, slideNumber);
  const corpus = available.map(s => ({ number: s.number, sentences: sentences(s.transcript || '') }));
  const allTranscript = available.map(s => s.transcript || '').join(' ');
  if (!allTranscript.trim()) return [];
  const slideTexts = lesson.slides.map(s => [s.title, ...(s.bullets || [])].map(plain).join(' ').toLowerCase());

  const scored = [];
  for (const [phrase, n] of candidates(slide)) {
    const hits = (allTranscript.match(phraseRe(phrase)) || []).length;
    if (!hits) continue;
    const spread = slideTexts.filter(t => phraseRe(phrase).test(t)).length || 1;
    const idf = Math.log(1 + lesson.slides.length / spread);
    scored.push({ phrase, score: hits * idf * (1 + 0.8 * (n - 1)) });
  }
  scored.sort((a, b) => b.score - a.score);

  // Prefer the longer phrase when it scores close to a shorter one it contains
  // ("admissible heuristic" over "admissible").
  const picked = [];
  for (const { phrase, score } of scored) {
    const shorter = picked.findIndex(p => phrase.includes(p.phrase));
    if (shorter !== -1) {
      if (score >= 0.6 * picked[shorter].score) picked[shorter] = { phrase, score };
      continue;
    }
    if (picked.some(p => p.phrase.includes(phrase))) continue;
    if (picked.length < max) picked.push({ phrase, score });
  }

  return picked.map(({ phrase }) => {
    let best = null;
    for (const { number, sentences: list } of corpus) {
      for (const sentence of list) {
        if (!phraseRe(phrase).test(sentence)) continue;
        let score = 1;
        if (DEFINING.test(sentence)) score += 3;
        if (number === slideNumber) score += 1;
        if (sentence.length > 260) score -= 2;
        if (!best || score > best.score) best = { sentence, number, score };
      }
    }
    const original = (plain([slide.title, ...(slide.bullets || [])].join(' ')).match(phraseRe(phrase)) || [phrase])[0];
    const term = original.charAt(0).toUpperCase() + original.slice(1);
    return {
      key: `x-${slugify(phrase)}`,
      term,
      aliases: [phrase],
      definition: best ? truncate(best.sentence, 280) : '',
      origin: 'extracted',
      slideNumber: best?.number ?? slideNumber,
    };
  }).filter(entry => entry.definition);
}

/**
 * For a lesson without its own glossary: adds the terms extracted for one slide, using only
 * the transcript heard so far. Slides whose terms were refined by AI keep those.
 */
export function withSlideGlossary(lesson, slideNumber) {
  const slide = lesson.slides[slideNumber - 1];
  if (!lesson.autoGlossary || !slide || slide.refined) return lesson;
  const entries = extractGlossary(lesson, slideNumber);
  const glossary = { ...lesson.glossary };
  for (const { key, ...rest } of entries) glossary[key] = rest;
  const slides = lesson.slides.slice();
  slides[slideNumber - 1] = { ...slide, keywords: entries.map(e => e.key) };
  return { ...lesson, glossary, slides };
}

/** Validates an AI-generated glossary: only terms that appear on the slide, no duplicates. */
export function acceptGeneratedTerms(lesson, slideNumber, items, origin) {
  const slide = lesson.slides[slideNumber - 1];
  const visible = [slide.title, ...(slide.bullets || []), slide.formula || ''].map(plain).join(' ').normalize('NFKC').toLowerCase();
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(items) ? items : []) {
    const term = typeof item?.term === 'string' ? item.term.trim() : '';
    const definition = typeof item?.definition === 'string' ? item.definition.trim() : '';
    const norm = term.normalize('NFKC').toLowerCase();
    if (!term || !definition || term.length > 120 || seen.has(norm) || !visible.includes(norm)) continue;
    seen.add(norm);
    out.push({ key: `${origin === 'server' ? 's' : 'c'}${slideNumber}-${slugify(term)}`, term, aliases: [term], definition: truncate(definition, 600), origin, slideNumber });
    if (out.length >= 8) break;
  }
  return out;
}
