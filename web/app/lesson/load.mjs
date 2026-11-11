import { slugify, textToBullets } from './model.mjs';
import { sampleLesson } from './sample.mjs';

// Loads the professor's lesson from web/lesson/lesson.json (see web/lesson/README.md).
// Without that file, the built-in sample lesson is used.
//
// The file uses the backend manifest format, so the same file can be imported into the
// backend with `npm run import:lecture`. Optional extras: per-slide "bullets", "image",
// "formula", "keywords", and a top-level "glossary".

export const LIMITS = { maxSlides: 150, maxSlideTranscript: 30_000, maxSlideText: 15_000, maxTitle: 200 };

export class LessonFileError extends Error {
  constructor(message) { super(message); this.name = 'LessonFileError'; }
}

const fail = message => { throw new LessonFileError(message); };
const isText = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const IMAGE = /^(?!\/)(?!.*\.\.)[\w./-]+\.(png|jpe?g|webp|svg)$/i;

function normalizeGlossary(raw) {
  const glossary = {};
  const add = (key, item) => {
    if (!item || typeof item !== 'object') return;
    const term = String(item.term || key || '').trim();
    const definition = String(item.definition ?? item.def ?? '').trim();
    if (!term || term.length > LIMITS.maxTitle) return;
    const aliases = Array.isArray(item.aliases) ? item.aliases.filter(a => typeof a === 'string' && a.trim()).map(a => a.trim()) : [];
    let id = slugify(key && !Array.isArray(raw) ? key : term);
    while (glossary[id]) id += '-2';
    glossary[id] = { term, definition, aliases, ...(item.formula ? { formula: String(item.formula) } : {}), origin: 'lesson' };
  };
  if (Array.isArray(raw)) raw.forEach(item => add('', item));
  else if (raw && typeof raw === 'object') Object.entries(raw).forEach(([key, item]) => add(key, item));
  return glossary;
}

/** Validates a lesson file and returns a lesson (see model.mjs for the shape). `base` prefixes image paths. */
export function parseLessonJson(data, base = 'lesson/') {
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail('The file must contain a JSON object with a "slides" array.');
  if (!Array.isArray(data.slides) || data.slides.length === 0) fail('"slides" must be an array with at least one slide.');
  if (data.slides.length > LIMITS.maxSlides) fail(`Too many slides (${data.slides.length}). The limit is ${LIMITS.maxSlides}.`);
  const title = isText(data.title, LIMITS.maxTitle) ? data.title.trim() : 'Lesson';
  const prepared = data.mode === 'prepared';
  if (prepared && !(typeof data.pdf === 'string' && /^(?!\/)(?!.*\.\.)[\w./-]+\.pdf$/i.test(data.pdf))) {
    fail('A prepared lesson needs a relative "pdf" path inside web/lesson/.');
  }
  const glossary = normalizeGlossary(data.glossary);
  const slides = data.slides.map((slide, index) => {
    const n = index + 1;
    if (!slide || typeof slide !== 'object') fail(`Slide ${n} must be an object.`);
    if (!isText(slide.title, LIMITS.maxTitle)) fail(`Slide ${n} needs a "title".`);
    const bullets = Array.isArray(slide.bullets) ? slide.bullets.filter(b => typeof b === 'string' && b.trim()).map(String)
      : textToBullets(typeof slide.text === 'string' ? slide.text : '');
    if (bullets.join(' ').length > LIMITS.maxSlideText) fail(`Slide ${n}: the slide text is too long.`);
    if (!bullets.length && !slide.image) fail(`Slide ${n} needs "text" (what is written on the slide) or an "image".`);
    const transcript = typeof slide.transcript === 'string' ? slide.transcript.trim() : '';
    if (transcript.length > LIMITS.maxSlideTranscript) fail(`Slide ${n}: the transcript is too long.`);
    if (slide.image !== undefined && !(typeof slide.image === 'string' && IMAGE.test(slide.image))) {
      fail(`Slide ${n}: "image" must be a relative path to a .png, .jpg, .webp or .svg file inside web/lesson/.`);
    }
    let keywords;
    let preparedContent = {};
    if (prepared) {
      if (slide.number !== n) fail(`Slide ${n}: page numbers must be consecutive and match the PDF.`);
      if (!isText(slide.context, 15_000) || !isText(slide.explain, 15_000)) fail(`Slide ${n} needs prepared "context" and "explain" text.`);
      if (!Array.isArray(slide.glossary) || !slide.glossary.length || slide.glossary.some(g => !isText(g?.term, 200) || !isText(g?.definition, 2000))) {
        fail(`Slide ${n} needs a glossary with a term and definition for every entry.`);
      }
      const local = normalizeGlossary(slide.glossary);
      keywords = Object.entries(local).map(([key, entry]) => {
        const id = `slide-${n}-${key}`;
        glossary[id] = { ...entry, origin: 'prepared', slideNumber: n };
        return id;
      });
      const references = slide.references ?? [];
      if (!Array.isArray(references) || references.some(ref => !Number.isInteger(ref) || ref < 1 || ref >= n)) {
        fail(`Slide ${n}: context references must point to earlier slides.`);
      }
      const symbols = slide.symbols ?? [];
      if (!Array.isArray(symbols) || symbols.length > 60 || symbols.some(s => !isText(s?.symbol, 100) || !isText(s?.definition, 1000))) {
        fail(`Slide ${n}: symbols need a mathematical label and definition.`);
      }
      preparedContent = { context: slide.context.trim(), explain: slide.explain.trim(), references: [...new Set(references)], symbols: symbols.map(s => ({ symbol: s.symbol, definition: s.definition })) };
    }
    if (!prepared && Array.isArray(slide.keywords)) {
      keywords = slide.keywords.filter(k => typeof k === 'string' && k.trim()).map(k => {
        const byKey = glossary[k] ? k : Object.keys(glossary).find(key => glossary[key].term.toLowerCase() === k.toLowerCase());
        if (byKey) return byKey;
        const id = slugify(k);
        glossary[id] = glossary[id] || { term: k.trim(), definition: '', aliases: [], origin: 'lesson' };
        return id;
      });
    }
    return {
      number: n, title: slide.title.trim(), bullets, transcript,
      ...(typeof slide.formula === 'string' && slide.formula ? { formula: slide.formula } : {}),
      ...(slide.image ? { image: base + slide.image } : {}),
      ...(keywords ? { keywords } : {}),
      ...preparedContent,
    };
  });
  const id = typeof data.id === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(data.id) ? data.id : slugify(title);
  return {
    id, title, course: isText(data.course, LIMITS.maxTitle) ? data.course.trim() : '', source: 'file',
    glossary, slides,
    ...(prepared ? { mode: 'prepared', pdf: base + data.pdf, language: data.language || 'en', contentNote: String(data.contentNote || '') } : {}),
    // Without a glossary, terms are picked from the slides and defined with the lecturer's words.
    autoGlossary: !Object.values(glossary).some(g => g.definition),
  };
}

/** Returns { lesson, error? }. Falls back to the sample lesson when the file is missing or invalid. */
export async function loadLesson(fetchImpl = fetch, base = 'lesson/') {
  let response;
  try { response = await fetchImpl(`${base}lesson.json`, { cache: 'no-store' }); }
  catch { return { lesson: sampleLesson() }; }
  if (!response.ok) return { lesson: sampleLesson() };
  try {
    return { lesson: parseLessonJson(await response.json(), base) };
  } catch (error) {
    const message = error instanceof LessonFileError ? error.message : 'It is not valid JSON.';
    return { lesson: sampleLesson(), error: `web/lesson/lesson.json could not be used: ${message} Showing the sample lesson.` };
  }
}
