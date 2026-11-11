import { createLessonApi } from './api/lesson.mjs';
import { MESSAGES } from './api/errors.mjs';
import { createAiSettings, PROVIDERS } from './ai-settings.mjs';
import { createLiveSession, heardLesson } from './live.mjs';
import { keywordsOf, plain } from './lesson/model.mjs';
import { loadLesson } from './lesson/load.mjs';
import { withSlideGlossary } from './lesson/glossary.mjs';
import { truncate } from './lesson/text.mjs';
import { $, $$, esc, linkTerms, markdown, reducedMotion, renderSlide } from './ui/render.mjs';
import { initSettings } from './ui/settings.mjs';
import { initIntro } from './ui/intro.mjs';
import { renderMath, mathBlock } from './ui/math.mjs';
import { revealText } from './reveal.mjs';

const ai = createAiSettings();
const api = createLessonApi({
  baseUrl: document.querySelector('meta[name="lesson-api"]')?.content || 'http://127.0.0.1:3001',
  getAi: () => ai.active(),
  revealDelay: reducedMotion() ? 0 : 18,
});

// URL options for the demo: ?start=4 (slide the lecture is on), ?paused, ?speed=2
const params = new URLSearchParams(location.search);
const narrow = matchMedia('(max-width: 999px)');
const SPEEDS = [1, 2, 4, 8];
const newAnswer = () => ({ status: 'idle', text: '', route: null, provider: null, fallback: null, error: null, controller: null, token: 0, userStopped: false, truncated: false });

const state = {
  lesson: null,
  live: null,          // snapshot from the live session
  slide: 1,            // slide the student is looking at (≤ live slide)
  follow: true,        // follows the professor's slide
  recapActive: false,  // the student asked for Katchup and the panel is still open
  health: { reachable: false, configured: false, provider: null },
  open: { thread: false, explain: false, gloss: false },
  order: [],
  answers: { context: newAnswer(), explain: newAnswer() },
  cache: new Map(),
  refine: { status: 'idle', controller: null, error: null, token: 0 },
  keyPrompted: false,
};
let session = null;
const prepared = () => state.lesson?.mode === 'prepared';
const lastAvailable = () => prepared() ? state.lesson.slides.length : state.live.slide;

const el = {
  slide: $('#slide'), strip: $('#strip'), prev: $('#prev'), next: $('#next'), title: $('#lesson-title'),
  panels: { thread: $('#panel-thread'), explain: $('#panel-explain'), gloss: $('#panel-gloss') },
  tools: { katchup: $('#tool-katchup'), explain: $('#tool-explain'), gloss: $('#tool-gloss') },
  answers: { context: $('#ans-context'), explain: $('#ans-explain') },
  threadSub: $('#thread-sub'), explainSub: $('#explain-sub'), glossSub: $('#gloss-sub'),
  sources: $('#thread-sources'), sourcesBody: $('#thread-sources-body'),
  gl: $('#gl'), glFoot: $('#gl-foot'), banner: $('#banner'), toast: $('#toast'),
  live: $('#live'), liveText: $('#live-text'), livePlay: $('#live-play'), liveSpeed: $('#live-speed'), backLive: $('#back-live'),
};

/** The lesson as the student can know it right now (nothing after what was heard). */
function view() {
  if (prepared()) return state.lesson;
  const heard = heardLesson(state.lesson, state.live.slide, state.live.word);
  return withSlideGlossary(heard, state.slide);
}
const current = () => view().slides[state.slide - 1];
const currentKeys = () => { const v = view(); return keywordsOf(v, v.slides[state.slide - 1]); };
const earlierRange = n => (n === 2 ? 'slide 1' : `slides 1–${n - 1}`);
const providerName = p => PROVIDERS[p]?.label || 'AI';

/* ---------------- toast & banner ---------------- */
let toastTimer;
function toast(message) {
  el.toast.textContent = message;
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2800);
}
function renderBanner(extra = '') {
  const online = navigator.onLine !== false;
  const text = extra || (!online && !prepared() ? MESSAGES.OFFLINE : '');
  el.banner.hidden = !text;
  el.banner.textContent = text;
  el.banner.dataset.tone = !online ? 'bad' : 'warn';
}
async function refreshHealth() {
  if (prepared()) return state.health;
  state.health = await api.health();
  return state.health;
}

/* ---------------- slides ---------------- */
function renderSlideArea() {
  const v = view();
  const slide = v.slides[state.slide - 1];
  renderSlide(el.slide, v, slide, keywordsOf(v, slide), { total: state.lesson.slides.length });
  el.title.textContent = [state.lesson.title, state.lesson.course].filter(Boolean).join(' · ');
  if (prepared()) {
    $('#slide-select').value = String(state.slide);
    $('#source-pdf').href = `${state.lesson.pdf}#page=${state.slide}`;
    $('#source-pdf').setAttribute('aria-label', `Open original PDF at slide ${state.slide}`);
  }
  renderStrip();
}

function renderStrip() {
  const live = prepared() ? null : state.live.slide;
  el.strip.setAttribute('role', 'group');
  el.strip.setAttribute('aria-label', 'Slides');
  el.strip.innerHTML = state.lesson.slides.map(s => {
    const future = !prepared() && s.number > live;
    const label = future ? `Slide ${s.number}: not presented yet` : `Slide ${s.number}: ${plain(s.title)}${s.number === live ? ' (live)' : ''}`;
    return `<button type="button" class="th${s.number === live ? ' is-live' : ''}" data-n="${s.number}" aria-label="${esc(label)}" title="${esc(label)}"${s.number === state.slide ? ' aria-current="true"' : ''}${future ? ' disabled' : ''}>${s.number}</button>`;
  }).join('');
  el.prev.disabled = state.slide === 1;
  el.next.disabled = state.slide >= lastAvailable();
  el.strip.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function renderLive(snapshot = state.live) {
  if (prepared()) {
    el.live.dataset.state = 'study';
    el.liveText.textContent = `Slide ${state.slide} / ${state.lesson.slides.length} · ${plain(current().title)}`;
    return;
  }
  const s = snapshot;
  el.live.dataset.state = s.ended ? 'ended' : s.playing ? 'live' : 'paused';
  el.liveText.textContent = s.recent ? `${s.recent}` : (s.ended ? 'The lecture has ended.' : '…');
  el.livePlay.setAttribute('aria-pressed', String(!s.playing));
  el.livePlay.setAttribute('aria-label', s.playing ? 'Pause the lecture' : 'Resume the lecture');
  el.livePlay.disabled = s.ended;
  el.liveSpeed.textContent = `${s.speed}×`;
  el.liveSpeed.setAttribute('aria-label', `Playback speed: ${s.speed}×`);
  const behind = state.slide < s.slide;
  el.backLive.hidden = !behind;
  el.backLive.textContent = `Live is on slide ${s.slide} →`;
}

function abortAll() {
  stopGlossReveal();
  for (const a of Object.values(state.answers)) { a.token++; a.controller?.abort(); a.controller = null; }
  state.refine.token++; state.refine.controller?.abort();
  state.refine = { status: 'idle', controller: null, error: null, token: state.refine.token };
}

function go(n, { follow } = {}) {
  const target = Math.max(1, Math.min(lastAvailable(), n));
  state.follow = follow ?? target === state.live.slide;
  if (target === state.slide) { renderLive(); return; }
  abortAll();
  state.slide = target;
  state.answers.context = { ...newAnswer(), token: state.answers.context.token };
  state.answers.explain = { ...newAnswer(), token: state.answers.explain.token };
  renderSlideArea();
  renderLive();
  if (state.open.thread) syncThread({ recap: true });
  if (state.open.explain) syncExplain();
  if (state.open.gloss) renderGloss();
}

/** Called by the live session for every word heard and every slide change. */
function onLive(snapshot, reason) {
  const prevSlide = state.live?.slide;
  state.live = snapshot;
  renderLive(snapshot);
  if (reason !== 'slide' || snapshot.slide === prevSlide) return;
  // The professor moved on. Follow along, unless the student is reading a panel or reviewing.
  const reading = state.open.thread || state.open.explain || state.open.gloss;
  if (state.follow && !reading) go(snapshot.slide, { follow: true });
  else { state.follow = false; renderStrip(); renderLive(); }
}

/* ---------------- panels ---------------- */
const toolFor = name => name === 'thread' ? el.tools.katchup : name === 'explain' ? el.tools.explain : el.tools.gloss;
const actionFor = name => name === 'thread' ? 'context' : 'explain';
function syncSheet() {
  const floating = state.open.thread || state.open.explain || (!prepared() && state.open.gloss);
  document.body.classList.toggle('sheet-open', narrow.matches && floating);
}

function openPanel(name, { focus = true } = {}) {
  const wasOpen = state.open[name];
  if (name === 'thread' || name === 'explain') closePanel(name === 'thread' ? 'explain' : 'thread', { restoreFocus: false });
  if (narrow.matches && !prepared()) {
    for (const other of Object.keys(state.open)) if (other !== name) closePanel(other, { restoreFocus: false });
  }
  state.open[name] = true;
  state.order = [...state.order.filter(p => p !== name), name];
  el.panels[name].hidden = false;
  toolFor(name).setAttribute('aria-expanded', 'true');
  toolFor(name).classList.add('on');
  syncSheet();
  if (name === 'gloss' && !wasOpen) renderGloss();
  if (focus) el.panels[name].focus({ preventScroll: true });
}

function closePanel(name, { restoreFocus = true } = {}) {
  if (!state.open[name]) return;
  const hadFocus = el.panels[name].contains(document.activeElement);
  state.open[name] = false;
  state.order = state.order.filter(p => p !== name);
  el.panels[name].hidden = true;
  const tool = toolFor(name);
  tool.setAttribute('aria-expanded', 'false');
  tool.classList.remove('on');
  syncSheet();
  if (name === 'thread' || name === 'explain') {
    if (name === 'thread') state.recapActive = false;
    const a = state.answers[actionFor(name)];
    if (a.controller) { a.token++; a.controller.abort(); a.controller = null; }
    if (a.status === 'loading' || a.status === 'streaming') a.status = 'idle';
  } else {
    stopGlossReveal();
    state.refine.token++; state.refine.controller?.abort();
    highlight(null);
  }
  if (restoreFocus && hadFocus) tool.focus();
}

narrow.addEventListener('change', () => {
  if (narrow.matches && !prepared()) {
    for (const name of state.order.slice(0, -1)) closePanel(name, { restoreFocus: false });
  }
  syncSheet();
});

/* ---------------- Katchup and Explain this slide ---------------- */
function katchup() {
  if (state.open.thread) { closePanel('thread'); return; }
  state.recapActive = true;
  openPanel('thread');
  syncThread({ recap: true });
  el.answers.context.scrollIntoView?.({ block: 'nearest' });
}

function explain() {
  if (state.open.explain) { closePanel('explain'); return; }
  openPanel('explain');
  syncExplain();
  requestAnimationFrame(() => el.answers.explain.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' }));
}

function syncExplain() {
  el.explainSub.textContent = `Slide ${state.slide} · step-by-step explanation`;
  if (prepared() || ['idle', 'error', 'stopped', 'needs-key'].includes(state.answers.explain.status)) runAnswer('explain');
  renderAnswer('explain');
}

const cacheKey = (action, v) => {
  const provider = ai.active().provider;
  // Explanations of the live slide change as the professor keeps talking.
  const heard = action === 'explain' && v.partialSlide === state.slide ? `:${state.live.word}` : '';
  return `${state.lesson.id}|${state.slide}|${action}|${provider}|${ai.hasKey(provider) ? 'k' : '-'}${heard}`;
};

function syncThread({ recap = false } = {}) {
  const n = state.slide;
  el.threadSub.textContent = prepared() ? `Slide ${n} · context and prerequisites` : n === 1 ? 'Slide 1 · start of the lecture' : `Slide ${n} · from what was said on ${earlierRange(n)}`;
  renderSources();
  if (recap && (prepared() || state.answers.context.status === 'idle')) runAnswer('context');
  renderAnswer('context');
}

async function runAnswer(action, { force = false } = {}) {
  const a = state.answers[action];
  a.token++; a.controller?.abort();
  const token = a.token;
  const lesson = view(), slideNumber = state.slide;
  const key = cacheKey(action, lesson);
  if (!force && !prepared() && state.cache.has(key)) { Object.assign(a, state.cache.get(key)); renderAnswer(action); return; }
  const controller = new AbortController();
  Object.assign(a, { status: 'loading', text: '', route: null, provider: null, fallback: null, error: null, controller, userStopped: false, truncated: false });
  renderAnswer(action);
  const stale = () => token !== a.token || slideNumber !== state.slide;
  try {
    const result = await api.streamAnswer({
      lesson, slideNumber, action, signal: controller.signal, health: state.health,
      onText: text => { if (stale()) return; a.text = text; a.status = 'streaming'; scheduleRender(action); },
    });
    if (stale()) return;
    Object.assign(a, { status: 'done', text: result.text, route: result.route, provider: result.provider || null, truncated: Boolean(result.truncated), fallback: result.fallback || null, controller: null });
    // A sample shown because the server's AI failed is not cached: the next request tries the server again.
    if (!a.fallback && !prepared()) state.cache.set(key, { status: 'done', text: a.text, route: a.route, provider: a.provider, truncated: a.truncated, fallback: null, error: null });
  } catch (error) {
    if (stale()) return;
    a.controller = null;
    if (error.code === 'ABORTED') a.status = a.userStopped ? 'stopped' : 'idle';
    else if (error.code === 'MISSING_KEY') {
      a.status = 'needs-key';
      if (!state.keyPrompted) { state.keyPrompted = true; settings.open({ notice: 'Choose an AI provider to get live answers for this lesson. The slides and the glossary work without one.' }); }
    } else {
      a.status = 'error'; a.error = error;
      if (error.partialText) a.text = error.partialText;
    }
  }
  renderAnswer(action);
}

const renderQueued = new Set();
function scheduleRender(action) {
  if (renderQueued.has(action)) return;
  renderQueued.add(action);
  requestAnimationFrame(() => { renderQueued.delete(action); renderAnswer(action); });
}

function ensureSkeleton(section) {
  if (section.querySelector('.out')) return;
  section.innerHTML = '<h3 class="answer-h"></h3><div class="slot-label"></div><div class="out prose" aria-live="polite" aria-busy="false"></div><div class="slot-alert"></div><p class="meta"></p><div class="answer-actions"></div>';
}

function metaFor(action, a) {
  const n = state.slide;
  if (a.route === 'prepared') return '';
  if (a.route === 'local') return 'Nothing to recap yet. No request was sent.';
  if (a.route === 'sample') return '';
  const scope = action === 'context' ? `what was said on ${earlierRange(n)}` : `slide ${n} and what was said about it${view().partialSlide === n ? ' so far' : ''}`;
  const who = a.route === 'server' ? `Generated by the lesson server${state.health.provider ? ` (${state.health.provider})` : ''}` : `Generated live by ${providerName(a.provider)}`;
  return `${who} from ${scope}. Check it against the transcript.${a.truncated ? ' The answer was cut short.' : ''}`;
}

function renderAnswer(action) {
  const section = el.answers[action];
  const a = state.answers[action];
  section.hidden = a.status === 'idle';
  if (a.status === 'idle') return;
  ensureSkeleton(section);
  const n = state.slide;
  section.querySelector('.answer-h').textContent = action === 'context' ? (prepared() ? `Context for slide ${n}` : n === 1 ? 'Where we are' : `What you missed before slide ${n}`) : `Slide ${n}, explained`;
  const out = section.querySelector('.out');
  const label = section.querySelector('.slot-label');
  const alert = section.querySelector('.slot-alert');
  const meta = section.querySelector('.meta');
  const actions = section.querySelector('.answer-actions');
  const busy = a.status === 'loading' || a.status === 'streaming';
  out.setAttribute('aria-busy', String(busy));
  out.classList.toggle('caret', a.status === 'streaming');

  const showLabel = a.route === 'sample' && ['done', 'streaming', 'stopped'].includes(a.status);
  label.innerHTML = !showLabel ? ''
    : a.fallback
      ? `<div class="label"><span><b>Sample answer:</b> ${esc(MESSAGES[a.fallback] || MESSAGES.UNKNOWN)}</span><button type="button" class="btn sm" data-retry="${action}">Ask the server again</button></div>`
      : '<div class="label"><span><b>Sample answer:</b> connect Claude, OpenAI or Ollama for live answers.</span><button type="button" class="btn sm" data-open-settings>Settings</button></div>';

  if (a.status === 'loading') out.innerHTML = '<div class="think" role="status"><i></i><i></i><i></i><span>Thinking…</span></div>';
  else if (a.status === 'needs-key') out.innerHTML = '';
  else {
    out.innerHTML = markdown(a.text);
    if (a.status !== 'streaming') linkTerms(out, view(), currentKeys());
  }

  if (a.status === 'needs-key') {
    alert.innerHTML = '<div class="alert key"><b>Live answers need an AI provider</b><span>There are no pre-written answers for this lesson. Pick Claude, OpenAI or a local Ollama model in Settings. The slides and the glossary keep working without one.</span><div><button type="button" class="btn sm primary" data-open-settings>Open Settings</button></div></div>';
  } else if (a.status === 'error') {
    const settingsIssue = ['INVALID_KEY', 'MODEL_NOT_FOUND', 'OLLAMA_UNREACHABLE', 'OLLAMA_FORBIDDEN'].includes(a.error?.code);
    alert.innerHTML = `<div class="alert" role="alert"><span>${esc(a.error?.message || MESSAGES.UNKNOWN)}</span><div class="answer-actions"><button type="button" class="btn sm" data-retry="${action}">Retry</button>${settingsIssue ? '<button type="button" class="btn sm" data-open-settings>Open Settings</button>' : ''}</div></div>`;
  } else alert.innerHTML = '';

  meta.textContent = a.status === 'done' ? metaFor(action, a) : a.status === 'stopped' ? 'Stopped.' : '';
  meta.hidden = !meta.textContent;
  actions.innerHTML = busy ? `<button type="button" class="btn sm" data-stop="${action}">Stop</button>`
    : a.status === 'stopped' ? `<button type="button" class="btn sm" data-retry="${action}">Retry</button>`
      : a.status === 'done' && (a.route === 'provider' || a.route === 'server') ? `<button type="button" class="btn sm" data-retry="${action}">Regenerate</button>` : '';
}

function renderSources() {
  const n = state.slide;
  const v = view();
  if (prepared()) {
    el.sources.querySelector('summary').textContent = 'Revisit the prerequisites';
    const references = current().references || [];
    el.sourcesBody.innerHTML = references.length
      ? references.map(number => `<button type="button" class="source-link" data-go="${number}">Slide ${number} · ${esc(v.slides[number - 1].title)} →</button>`).join('')
      : '<p class="tr-item">This is the opening slide. No earlier pages are required.</p>';
    return;
  }
  const items = v.slides.slice(0, n).filter(s => s.transcript);
  el.sources.querySelector('summary').textContent = `Transcript heard so far (slides 1–${n})`.replace('slides 1–1', 'slide 1');
  el.sourcesBody.innerHTML = items.length
    ? items.map(s => `<div class="tr-item"><b>Slide ${s.number} · ${esc(plain(s.title))}${v.partialSlide === s.number ? ' · live' : ''}</b><p>${esc(truncate(s.transcript, 700))}</p></div>`).join('')
    : '<p class="tr-item">Nothing has been said yet.</p>';
}

/* ---------------- glossary ---------------- */
let glossReveal = null;
function stopGlossReveal({ complete = false } = {}) {
  if (!glossReveal) return;
  const { controller, definitions } = glossReveal;
  controller.abort();
  for (const { node, text } of definitions) {
    node.classList.remove('token-caret');
    if (complete) node.textContent = text;
  }
  el.gl.setAttribute('aria-busy', 'false');
  glossReveal = null;
}

async function revealGloss() {
  const controller = new AbortController();
  const definitions = $$('.gcard > p', el.gl).map(node => ({ node, text: node.textContent }));
  glossReveal = { controller, definitions };
  el.gl.setAttribute('aria-busy', 'true');
  definitions.forEach(({ node }) => { node.textContent = ''; });
  try {
    for (const { node, text } of definitions) {
      if (controller.signal.aborted) return;
      node.classList.add('token-caret');
      await revealText(text, shown => { node.textContent = shown; }, controller.signal, { delay: 18 });
      node.classList.remove('token-caret');
    }
  } catch (error) {
    if (error.code !== 'ABORTED') {
      definitions.forEach(({ node, text }) => { node.textContent = text; });
      console.error('Glossary animation failed:', error);
    }
  } finally {
    if (glossReveal?.controller === controller) {
      definitions.forEach(({ node }) => node.classList.remove('token-caret'));
      el.gl.setAttribute('aria-busy', 'false');
      glossReveal = null;
    }
  }
}

function renderGloss() {
  stopGlossReveal();
  const v = view();
  const keys = keywordsOf(v, v.slides[state.slide - 1]);
  el.glossSub.textContent = `Slide ${state.slide} · ${keys.length} ${keys.length === 1 ? 'term' : 'terms'}`;
  const symbols = current().symbols || [];
  $('#symbol-guide').hidden = !symbols.length;
  $('#symbols').innerHTML = symbols.map(s => `<div class="symbol-row"><dt>${renderMath(s.symbol)}</dt><dd>${esc(s.definition)}</dd></div>`).join('');
  el.gl.innerHTML = keys.length ? keys.map(key => {
    const g = v.glossary[key];
    const extracted = g.origin === 'extracted';
    const definition = g.definition
      ? `<p class="${extracted ? 'quote' : ''}">${esc(extracted ? `“${g.definition}”` : g.definition)}</p>`
      : '<p>No definition in the lesson file yet.</p>';
    const source = extracted ? `<span class="src">The lecturer, slide ${g.slideNumber}</span>`
      : g.origin === 'ai' ? '<span class="src">Defined by AI from the transcript</span>'
        : g.origin === 'server' ? '<span class="src">Defined by the lesson server from the transcript</span>' : '';
    return `<div class="gcard" role="listitem" tabindex="0" data-k="${esc(key)}"><h3>${esc(g.term)}</h3>${definition}${g.formula ? mathBlock(g.formula) : ''}${source}</div>`;
  }).join('') : `<p class="empty">${v.autoGlossary ? 'No terms heard on this slide yet.' : 'No key terms are marked on this slide.'}</p>`;

  const route = api.route(v, state.health);
  const canRefine = state.lesson.source !== 'sample' && (route === 'provider' || route === 'server');
  const r = state.refine;
  let foot = '';
  if (keys.some(k => v.glossary[k].origin === 'extracted')) foot += '<p class="meta">Terms picked from the slide; definitions quoted from what the lecturer has said so far. No AI involved.</p>';
  if (r.status === 'loading') foot += '<div class="think" role="status"><i></i><i></i><i></i><span>Thinking…</span></div>';
  else if (r.status === 'error') foot += `<div class="alert" role="alert"><span>${esc(r.error?.message || MESSAGES.UNKNOWN)}</span><div><button type="button" class="btn sm" data-refine>Retry</button></div></div>`;
  else if (canRefine) foot += '<div><button type="button" class="btn sm" data-refine>Refine definitions with AI</button></div>';
  el.glFoot.innerHTML = foot;
  if (prepared() && !reducedMotion()) revealGloss();
}

async function refineGlossary() {
  state.refine.token++; state.refine.controller?.abort();
  const token = state.refine.token, lesson = view(), slideNumber = state.slide;
  const controller = new AbortController();
  state.refine = { status: 'loading', controller, error: null, token };
  renderGloss();
  try {
    const { entries } = await api.refineGlossary({ lesson, slideNumber, signal: controller.signal, health: state.health });
    if (token !== state.refine.token || slideNumber !== state.slide) return;
    for (const { key, ...entry } of entries) state.lesson.glossary[key] = entry;
    Object.assign(state.lesson.slides[slideNumber - 1], { keywords: entries.map(e => e.key), refined: true });
    state.refine = { status: 'idle', controller: null, error: null, token };
    renderSlideArea();
    renderGloss();
    toast(`${entries.length} ${entries.length === 1 ? 'term' : 'terms'} refined`);
  } catch (error) {
    if (token !== state.refine.token || error.code === 'ABORTED') return;
    state.refine = { status: 'error', controller: null, error, token };
    renderGloss();
  }
}

// One highlighted term at a time: the hovered card wins, otherwise the focused one.
function highlight(key) {
  $$('.kw', el.slide).forEach(b => b.classList.toggle('hl', Boolean(key) && b.dataset.k === key));
}
const focusedCardKey = () => (el.gl.contains(document.activeElement) ? document.activeElement.closest('.gcard')?.dataset.k : null);

function focusTerm(key) {
  openPanel('gloss', { focus: false });
  stopGlossReveal({ complete: true });
  const card = el.gl.querySelector(`.gcard[data-k="${CSS.escape(key)}"]`);
  if (!card) { el.panels.gloss.focus({ preventScroll: true }); return; }
  card.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  card.focus({ preventScroll: true });
  card.classList.add('flash');
  setTimeout(() => card.classList.remove('flash'), 1400);
}

/* ---------------- events ---------------- */
el.prev.addEventListener('click', () => go(state.slide - 1));
el.next.addEventListener('click', () => go(state.slide + 1));
el.strip.addEventListener('click', e => { const b = e.target.closest('.th'); if (b && !b.disabled) go(Number(b.dataset.n)); });
$('#slide-select').addEventListener('change', e => go(Number(e.target.value)));
el.backLive.addEventListener('click', () => go(state.live.slide, { follow: true }));
el.livePlay.addEventListener('click', () => session.toggle());
el.liveSpeed.addEventListener('click', () => session.setSpeed(SPEEDS[(SPEEDS.indexOf(state.live.speed) + 1) % SPEEDS.length]));
el.tools.katchup.addEventListener('click', katchup);
el.tools.explain.addEventListener('click', explain);
el.tools.gloss.addEventListener('click', () => (state.open.gloss ? closePanel('gloss') : openPanel('gloss')));
$$('[data-close]').forEach(b => b.addEventListener('click', () => closePanel(b.dataset.close)));

document.addEventListener('click', e => {
  const source = e.target.closest('[data-go]');
  if (source) { go(Number(source.dataset.go)); return; }
  const term = e.target.closest('.kw[data-k], .kt[data-k]');
  if (term && !term.closest('.intro')) { focusTerm(term.dataset.k); return; }
  if (e.target.closest('[data-open-settings]')) { settings.open(); return; }
  const run = e.target.closest('[data-run]');
  if (run) { if (run.dataset.run === 'context') { state.recapActive = true; runAnswer('context'); } else explain(); return; }
  const stop = e.target.closest('[data-stop]');
  if (stop) { const a = state.answers[stop.dataset.stop]; a.userStopped = true; a.controller?.abort(); return; }
  const retry = e.target.closest('[data-retry]');
  if (retry) { runAnswer(retry.dataset.retry, { force: true }); return; }
  if (e.target.closest('[data-refine]')) refineGlossary();
});

el.gl.addEventListener('mouseover', e => { const c = e.target.closest('.gcard'); if (c) highlight(c.dataset.k); });
el.gl.addEventListener('mouseout', e => { const c = e.target.closest('.gcard'); if (c && !c.contains(e.relatedTarget)) highlight(focusedCardKey()); });
el.gl.addEventListener('focusin', e => { const c = e.target.closest('.gcard'); if (c) highlight(c.dataset.k); });
el.gl.addEventListener('focusout', () => requestAnimationFrame(() => highlight(focusedCardKey())));

const typing = target => target.closest?.('input, textarea, select, [contenteditable="true"]');
document.addEventListener('keydown', e => {
  if (!state.lesson || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  if (document.querySelector('dialog[open]') || intro.isOpen()) return;
  if (e.key === 'Escape') {
    if (intro.coachActive()) { intro.endCoach(); e.preventDefault(); return; }
    const focused = Object.keys(el.panels).find(name => state.open[name] && el.panels[name].contains(document.activeElement));
    const target = focused || state.order[state.order.length - 1];
    if (target) {
      closePanel(target, { restoreFocus: true });
      if (!focused) toolFor(target).focus();
      e.preventDefault();
    }
    return;
  }
  if (typing(e.target)) return;
  const k = e.key.toLowerCase();
  const actions = {
    arrowright: () => go(state.slide + 1), pagedown: () => go(state.slide + 1),
    arrowleft: () => go(state.slide - 1), pageup: () => go(state.slide - 1),
    home: () => go(1), end: () => go(lastAvailable(), { follow: true }),
    k: katchup, e: explain,
    g: () => (state.open.gloss ? closePanel('gloss') : openPanel('gloss')),
    p: () => intro.open(),
  };
  if (actions[k]) { actions[k](); e.preventDefault(); }
});

window.addEventListener('online', () => { renderBanner(); refreshHealth(); });
window.addEventListener('offline', () => renderBanner());

/* ---------------- dialogs, presentation, start ---------------- */
const app = {
  api, ai, state, toast, refreshHealth, openPanel, closePanel, katchup, explain,
  onAiChange() {
    state.cache.clear();
    for (const action of ['context', 'explain']) {
      const a = state.answers[action];
      if (['needs-key', 'done', 'error'].includes(a.status)) { a.status = 'idle'; a.text = ''; a.route = null; }
    }
    if (state.open.thread) syncThread({ recap: state.recapActive });
    if (state.open.explain) syncExplain();
    if (state.open.gloss) renderGloss();
  },
};
const settings = initSettings(app);
const intro = initIntro(app);

async function start() {
  const { lesson, error } = await loadLesson();
  state.lesson = lesson;
  const health = await refreshHealth();
  // A lesson also imported into the backend (same id) can be answered by the server.
  if (!prepared() && health.reachable && await api.hasServerLecture(lesson.id)) lesson.serverId = lesson.id;
  state.lesson = lesson; // only now: shortcuts wait until the lesson and its server are known
  const startSlide = Math.max(1, Math.min(lesson.slides.length, Math.trunc(Number(params.get('start'))) || (lesson.source === 'sample' ? 4 : 1)));
  const speed = SPEEDS.includes(Number(params.get('speed'))) ? Number(params.get('speed')) : 1;
  session = createLiveSession(lesson, { startSlide, speed, playing: !prepared() && !params.has('paused'), onChange: onLive });
  state.live = session.snapshot();
  state.slide = state.live.slide;
  if (prepared()) {
    document.body.classList.add('prepared-lesson');
    document.documentElement.lang = lesson.language;
    document.title = 'Katchup · Lecture 5a';
    $('#study-nav').hidden = false;
    $('#slide-select').innerHTML = lesson.slides.map(s => `<option value="${s.number}">${s.number}. ${esc(s.title)}</option>`).join('');
    $('.live-ctl').hidden = true;
    el.liveText.removeAttribute('aria-hidden');
    $('.tool-d', el.tools.katchup).textContent = 'The context you need for this slide';
    $('.tool-d', el.tools.gloss).textContent = 'Key terms, symbols and prerequisites';
    $('#ans-context').setAttribute('aria-label', 'Context for this slide');
    $('#open-settings').setAttribute('aria-label', 'Settings: appearance');
    $('#provider-choices').closest('fieldset').hidden = true;
  }
  if (!prepared()) $('.live-ctl').hidden = false;
  renderSlideArea();
  renderLive();
  el.live.hidden = false;
  renderBanner(error);
  if (prepared()) openPanel('gloss', { focus: false });
  if (location.hash === '#present') intro.open();
}
window.addEventListener('hashchange', () => { if (location.hash === '#present') intro.open(); });
export const ready = start();
