import { FIGURES } from './figures.mjs';
import { aliasMatcher, keywordParts, plain } from '../lesson/model.mjs';
import { renderMath, mathBlock } from './math.mjs';

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Escaped slide text with keyword buttons. */
function marked(lesson, value, keys) {
  return keywordParts(lesson, value, keys).map(part => (part.key
    ? `<button type="button" class="kw" data-k="${esc(part.key)}" aria-label="${esc(part.text)}: show in glossary">${esc(part.text)}</button>`
    : esc(part.text))).join('');
}

/** Renders a slide into an <article class="slide">. */
export function renderSlide(el, lesson, slide, keys, { counter = true, total = lesson.slides.length } = {}) {
  const figure = slide.figure && FIGURES[slide.figure];
  el.setAttribute('aria-label', `Slide ${slide.number} of ${total}: ${plain(slide.title)}`);
  el.classList.toggle('no-fig', !figure);
  el.classList.toggle('is-image', Boolean(slide.image));
  if (slide.image) {
    // The professor's real slide (exported from the PDF). Its text stays available to screen readers.
    const alt = [plain(slide.title), ...(slide.bullets || []).map(plain)].join('. ');
    el.innerHTML = `<img class="s-img" src="${esc(slide.image)}" alt="${esc(alt)}">`;
    return;
  }
  el.innerHTML = `
    <div class="s-top"><span>${esc(lesson.title)}</span>${counter ? `<span>Slide ${slide.number}</span>` : ''}</div>
    <div class="s-body">
      <div class="s-text">
        <h2 class="s-title">${marked(lesson, slide.title, keys)}</h2>
        <ul class="s-list">${(slide.bullets || []).map(b => `<li>${marked(lesson, b, keys)}</li>`).join('')}</ul>
        ${slide.formula ? mathBlock(slide.formula) : ''}
      </div>
      ${figure ? `<div class="s-fig" aria-hidden="false">${figure()}</div>` : ''}
    </div>
    ${counter ? `<div class="s-foot" aria-hidden="true">${slide.number} / ${total}</div>` : ''}`;
}

/** Minimal, safe Markdown: paragraphs, lists, **bold**, `code`. Everything is escaped first. */
export function markdown(text) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  let html = '', list = null, para = [];
  const inline = s => s.split(/(`[^`]+`)/g).map(part => part.startsWith('`') && part.endsWith('`')
    ? `<span class="inline-formula">${renderMath(part.slice(1, -1))}</span>`
    : esc(part).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')).join('');
  const flushP = () => { if (para.length) { html += `<p>${para.map(inline).join('<br>')}</p>`; para = []; } };
  const flushL = () => { if (list) { html += `<${list.tag}>${list.items.map(x => `<li>${inline(x)}</li>`).join('')}</${list.tag}>`; list = null; } };
  for (const raw of lines) {
    const line = raw.trim(); let m;
    if (!line) { flushP(); flushL(); continue; }
    if (/^`[^`]+`[.]?$/.test(line)) { flushP(); flushL(); html += mathBlock(line.slice(1, line.lastIndexOf('`'))); continue; }
    if ((m = /^[-*•]\s+(.*)$/.exec(line))) { flushP(); if (list?.tag !== 'ul') { flushL(); list = { tag: 'ul', items: [] }; } list.items.push(m[1]); continue; }
    if ((m = /^\d+[.)]\s+(.*)$/.exec(line))) { flushP(); if (list?.tag !== 'ol') { flushL(); list = { tag: 'ol', items: [] }; } list.items.push(m[1]); continue; }
    flushL(); para.push(line.replace(/^#{1,6}\s*/, ''));
  }
  flushP(); flushL();
  return html;
}

/** Turns glossary terms inside rendered prose into buttons (outside code and buttons). */
export function linkTerms(root, lesson, keys) {
  const matcher = aliasMatcher(lesson, keys);
  if (!matcher) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = []; let node;
  while ((node = walker.nextNode())) nodes.push(node);
  const linked = new Set();
  for (const textNode of nodes) {
    if (textNode.parentElement.closest('button,code,math,.formula,.inline-formula')) continue;
    const text = textNode.nodeValue;
    const frag = document.createDocumentFragment();
    let last = 0, changed = false;
    for (const m of text.matchAll(matcher.re)) {
      const key = matcher.keyFor(m[1]);
      if (!key || linked.has(key)) continue; // link the first mention of each term only
      linked.add(key);
      if (m.index > last) frag.append(text.slice(last, m.index));
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'kt'; button.dataset.k = key; button.textContent = m[1];
      button.setAttribute('aria-label', `${m[1]}: show in glossary`);
      frag.append(button);
      last = m.index + m[1].length; changed = true;
    }
    if (!changed) continue;
    if (last < text.length) frag.append(text.slice(last));
    textNode.replaceWith(frag);
  }
}
