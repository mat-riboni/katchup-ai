import { $, esc, markdown, renderSlide } from './render.mjs';
import { sampleLesson } from '../lesson/sample.mjs';
import { keywordsOf } from '../lesson/model.mjs';

// Presentation mode: a dismissible full-screen opening in three beats
// (problem → solution → value), then a guided walkthrough on the real interface.
// No statistics or efficacy claims: only what the product does.

const SCENE_SLIDE = 7;               // "Backpropagation" in the sample lesson
const CONFUSING = ['graph', 'reverse']; // the two terms the student doesn't know

const BEATS = [
  {
    kicker: 'The problem',
    title: 'Slide 12. “As we saw earlier…”',
    lead: [
      'The lecturer moves on. You lost the thread a few slides back, and two terms on this slide mean nothing to you yet.',
      'Scrolling back through the slides means missing what is being said right now.',
    ],
    scene: 'problem',
  },
  {
    kicker: 'Katchup',
    title: 'Catch up without leaving the slide.',
    lead: ['Katchup listens to the lecture with you. One click tells you what you missed. One click explains every term on the slide. The slide stays in front of you.'],
    scene: 'solution',
    stack: true,
  },
  {
    kicker: 'Three tools',
    title: 'Everything is one click away.',
    lead: ['Built only from what the lecturer has said so far: never from slides still to come.'],
    steps: [
      ['Katchup', 'What you missed before this slide, recapped from the live transcript.'],
      ['Explain this slide', 'The current slide in plain words, from what the lecturer is saying about it.'],
      ['Glossary', 'Every term on the slide, defined the way the lecturer uses it.'],
    ],
    scene: 'value',
  },
];

const COACH = [
  { target: '#tool-katchup', title: 'Katchup', text: 'Lost after “as we saw earlier”? One click recaps what was said before this slide.', after: app => app.katchup() },
  { target: '#tool-explain', title: 'Explain this slide', text: 'The slide in plain words, from what the lecturer is saying about it right now.', after: app => app.explain() },
  { target: '#tool-gloss', title: 'Glossary', text: 'Every term on this slide. Hover a term to find it on the slide; click a term on the slide to find it here.', after: app => app.openPanel('gloss', { focus: false }), last: true },
];

const STUDY_BEATS = [
  { kicker: 'The problem', title: 'A slide assumes you remember the earlier ones.', lead: ['A formula, a symbol, a diagram: following a lecture is easier when the missing context is close at hand.'], scene: 'problem' },
  { kicker: 'Katchup', title: 'Recover the context. Keep the slide.', lead: ['Connect the ideas, unpack each formula and follow Lecture 5a with confidence.'], scene: 'solution', stack: true },
  { kicker: 'Three tools', title: 'Understand all 62 slides.', lead: ['Open a tool to explore the ideas behind the slide.'], steps: [['Katchup', 'Prerequisites and connections to earlier pages.'], ['Explain this slide', 'Plain-language explanations and worked calculations.'], ['Glossary', 'Terms, symbols and diagram labels for the current page.']], scene: 'value' },
];
const STUDY_COACH = [
  { ...COACH[0], text: 'Open the context and prerequisites needed to understand the current slide.' },
  { ...COACH[1], text: 'Read the page-specific explanation, including worked calculations and notation clarifications.' },
  { ...COACH[2], text: 'Read definitions for this page’s terms and symbols. Terms in the notes link to their glossary cards.' },
];

export function initIntro(app) {
  const root = $('#intro');
  const body = $('#intro-body');
  const beats = $('#beats');
  const next = $('#intro-next');
  const back = $('#intro-back');
  const coach = $('#coach');
  const ring = $('#coach-ring');
  const tip = $('#coach-tip');
  const inertTargets = ['.top', '#banner', '#work', '.skip'].map(s => $(s)).filter(Boolean);
  let index = 0;
  let opener = null;
  let coachIndex = -1;

  const sample = sampleLesson();
  const isStudy = () => app.state.lesson?.mode === 'prepared';
  const currentBeats = () => isStudy() ? STUDY_BEATS : BEATS;
  const currentCoach = () => isStudy() ? STUDY_COACH : COACH;
  const sceneLesson = () => isStudy() ? app.state.lesson : sample;
  const sceneSlide = () => sceneLesson().slides[isStudy() ? 24 : SCENE_SLIDE - 1];
  const sceneKeys = () => isStudy() ? keywordsOf(sceneLesson(), sceneSlide()).slice(0, 2) : CONFUSING;

  function slideMarkup() { return '<article class="slide" aria-hidden="true"></article>'; }
  function fillSlide(container) {
    const article = container.querySelector('.slide');
    if (article) renderSlide(article, sceneLesson(), sceneSlide(), sceneKeys(), { counter: false });
    article?.querySelectorAll('.kw').forEach(b => { b.tabIndex = -1; });
  }

  function scene(kind) {
    if (kind === 'problem') {
      return `<div class="scene" id="scene">
        <div class="bubble lecturer"><small>${isStudy() ? 'Reading the slide' : 'Lecturer'}</small>${isStudy() ? '“Why can we replace the remaining return with a value?”' : '“As we saw earlier, we just run it backwards.”'}</div>
        ${slideMarkup()}
        <div class="missed" aria-hidden="true"><span>${isStudy() ? '8' : '9'}</span><span>${isStudy() ? '17' : '10'}</span><span>${isStudy() ? '20' : '11'}</span><em>the slides you lost track of</em></div>
      </div>`;
    }
    if (kind === 'solution') {
      const lesson = sceneLesson(), slide = sceneSlide();
      const g = lesson.glossary;
      return `<div class="scene solve" id="scene">
        <div class="mini l"><h4>Katchup <span class="click">K · 1 click</span></h4><div class="prose">${markdown(isStudy() ? slide.context : lesson.sampleAnswers[SCENE_SLIDE].context)}</div></div>
        <div class="stagebox">${slideMarkup()}</div>
        <div class="mini r"><h4>Glossary <span class="click">G · 1 click</span></h4><dl>${sceneKeys().map(k => `<div><dt>${esc(g[k].term)}</dt><dd>${esc(g[k].definition)}</dd></div>`).join('')}</dl></div>
      </div>`;
    }
    return '';
  }

  function placeQuestionMarks() {
    const sceneEl = $('#scene');
    if (!sceneEl || currentBeats()[index].scene !== 'problem') return;
    sceneEl.querySelectorAll('.qmark').forEach(q => q.remove());
    const box = sceneEl.getBoundingClientRect();
    sceneEl.querySelectorAll('.kw').forEach(term => {
      const r = term.getBoundingClientRect();
      const q = document.createElement('span');
      q.className = 'qmark'; q.textContent = '?'; q.setAttribute('aria-hidden', 'true');
      q.style.left = `${r.right - box.left}px`;
      q.style.top = `${r.top - box.top}px`;
      sceneEl.append(q);
    });
  }

  function render() {
    const BEATS = currentBeats();
    const beat = BEATS[index];
    beats.innerHTML = BEATS.map((b, i) => `<li${i === index ? ' aria-current="step"' : ''}${i < index ? ' class="done"' : ''}><span class="sr-only">${i + 1}. ${b.kicker}${i === index ? ' (current)' : ''}</span></li>`).join('');
    const copy = `<div class="copy"><p class="kicker">${index + 1} / ${BEATS.length} · ${beat.kicker}</p><h2 id="intro-h">${beat.title}</h2>
      ${beat.lead.map(p => `<p class="lead">${p}</p>`).join('')}
      ${beat.steps ? `<ol class="steps">${beat.steps.map(([t, d]) => `<li><b>${t}</b><span>${d}</span></li>`).join('')}</ol>` : ''}</div>`;
    body.innerHTML = `<div class="beat${beat.stack ? ' stack' : ''}${beat.scene === 'value' ? ' solo' : ''}">${copy}${scene(beat.scene)}</div>`;
    fillSlide(body);
    back.disabled = index === 0;
    next.textContent = index === BEATS.length - 1 ? 'Start the walkthrough' : 'Next';
    requestAnimationFrame(placeQuestionMarks);
    body.querySelector('.beat')?.addEventListener('animationend', placeQuestionMarks, { once: true });
  }

  function setInert(on) { inertTargets.forEach(node => { node.inert = on; }); }

  function open() {
    if (!root.hidden) return;
    opener = document.activeElement;
    endCoach();
    index = 0;
    root.hidden = false;
    setInert(true);
    document.body.style.overflow = 'hidden';
    render();
    next.focus();
  }

  function close({ restore = true } = {}) {
    if (root.hidden) return;
    root.hidden = true;
    setInert(false);
    document.body.style.overflow = '';
    if (location.hash === '#present') history.replaceState(null, '', location.pathname + location.search);
    if (restore && opener?.isConnected) opener.focus();
  }

  /* ---------- walkthrough on the real UI ---------- */
  function positionCoach() {
    const COACH = currentCoach();
    if (coachIndex < 0) return;
    const target = $(COACH[coachIndex].target);
    if (!target) return;
    const r = target.getBoundingClientRect();
    const pad = 6;
    Object.assign(ring.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    const below = r.bottom + 14 + th < innerHeight;
    const top = below ? r.bottom + 14 : Math.max(12, r.top - th - 14);
    const left = Math.min(Math.max(12, r.left + r.width / 2 - tw / 2), innerWidth - tw - 12);
    Object.assign(tip.style, { top: `${top}px`, left: `${left}px` });
  }

  function showCoach(i) {
    const COACH = currentCoach();
    coachIndex = i;
    const step = COACH[i];
    $('#coach-step').textContent = `Step ${i + 1} of ${COACH.length}`;
    $('#coach-h').textContent = step.title;
    $('#coach-p').textContent = step.text;
    $('#coach-next').textContent = step.last ? 'Finish' : 'Next';
    coach.hidden = false;
    $(step.target)?.scrollIntoView({ block: 'nearest' });
    positionCoach();
    $('#coach-next').focus();
  }

  function advanceCoach() {
    const COACH = currentCoach();
    const step = COACH[coachIndex];
    if (!step) return;
    step.after?.(app);
    if (step.last) { endCoach(); app.toast('Ready. Press K, E or G any time.'); return; }
    // Let the panel open (layout changes) before measuring the next target.
    requestAnimationFrame(() => requestAnimationFrame(() => showCoach(coachIndex + 1)));
  }

  function endCoach() {
    if (coachIndex < 0) return;
    coachIndex = -1;
    coach.hidden = true;
  }

  // Using the highlighted control itself also moves the walkthrough on.
  document.addEventListener('click', e => {
    const COACH = currentCoach();
    if (coachIndex < 0) return;
    const step = COACH[coachIndex];
    if (e.target.closest(step.target)) {
      if (step.last) { endCoach(); return; }
      requestAnimationFrame(() => requestAnimationFrame(() => showCoach(coachIndex + 1)));
    }
  }, true);

  next.addEventListener('click', () => {
    const BEATS = currentBeats();
    if (index < BEATS.length - 1) { index++; render(); next.focus(); return; }
    close({ restore: false });
    showCoach(0);
  });
  back.addEventListener('click', () => { if (index > 0) { index--; render(); } });
  $('#intro-skip').addEventListener('click', () => close());
  $('#coach-next').addEventListener('click', advanceCoach);
  $('#coach-skip').addEventListener('click', () => { endCoach(); $('#tool-katchup').focus(); });
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowRight' && !e.target.closest('button')) next.click();
    else if (e.key === 'ArrowLeft' && !e.target.closest('button')) back.click();
  });
  tip.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); endCoach(); } });
  addEventListener('resize', () => { positionCoach(); placeQuestionMarks(); });
  addEventListener('scroll', positionCoach, true);

  return { open, close, isOpen: () => !root.hidden, coachActive: () => coachIndex >= 0, endCoach };
}
