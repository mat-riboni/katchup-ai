import { LessonError, backendCodeToCode, isAbort } from './errors.mjs';
import { streamWithProvider } from './providers.mjs';
import { buildPrompt } from './prompts.mjs';
import { acceptGeneratedTerms } from '../lesson/glossary.mjs';
import { pause as sleep, revealText as reveal } from '../reveal.mjs';

// The adapter: the only module that talks to the network.
//
// Existing backend endpoints used (no backend changes):
//   GET  /api/health                  → reachability, and whether the server has an AI provider
//   GET  /api/lectures/:id            → is the lesson in web/lesson/lesson.json also on the server?
//   POST /api/lectures/:id/actions    → { action: context|explain|glossary, slideNumber, transcriptThroughSlide }
//
// Missing on the backend, handled here:
//   live transcript   – no speech-to-text / streaming transcript endpoint: the transcript is
//                       simulated in the browser (app/live.mjs) and only what was "heard" is sent
//   streaming answers – the backend returns the whole answer; it is revealed progressively
//   per-user provider – the backend reads provider and key from its .env only, so a provider
//                       chosen in Settings (Claude, OpenAI, Ollama) is called from the browser

export const ROUTES = { PREPARED: 'prepared', SERVER: 'server', PROVIDER: 'provider', SAMPLE: 'sample', NEEDS_KEY: 'needs-key' };

const CLOUD = new Set(['claude', 'openai']);

/** Turns the backend's structured Answer into Markdown. */
export function answerToMarkdown(answer) {
  const cite = ids => {
    const slides = [...new Set((ids || []).map(id => Number(String(id).split(':')[1])).filter(Boolean))];
    return slides.length ? ` (slide ${slides.join(', ')})` : '';
  };
  const parts = [];
  if (answer.summary) parts.push(answer.summary);
  if (answer.points?.length) parts.push(answer.points.map(p => `- ${p.text}${cite(p.sourceIds)}`).join('\n'));
  if (answer.status === 'insufficient_context' && answer.missingContext?.length) {
    parts.push(`**Not covered in the transcript so far**\n${answer.missingContext.map(m => `- ${m}`).join('\n')}`);
  }
  return parts.join('\n\n');
}

const FIRST_SLIDE_CONTEXT = 'This is the **first slide**, so nothing has been explained before it yet.\n\nUse **Explain this slide** to go through what it says.';

export function createLessonApi({
  baseUrl = 'http://127.0.0.1:3001',
  fetchImpl = (...args) => fetch(...args),
  getAi = () => ({ provider: 'auto' }),
  isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
  revealDelay = 20,
} = {}) {
  const root = baseUrl.replace(/\/$/, '');

  async function backend(path, { method = 'GET', body, signal } = {}) {
    let response;
    try {
      response = await fetchImpl(`${root}${path}`, {
        method, signal,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      if (isAbort(error) || signal?.aborted) throw new LessonError('ABORTED');
      throw new LessonError(isOnline() ? 'BACKEND_UNREACHABLE' : 'OFFLINE');
    }
    let data = null;
    try { data = await response.json(); } catch { /* handled below */ }
    if (!response.ok) throw new LessonError(backendCodeToCode(data?.error?.code, response.status));
    if (data === null) throw new LessonError('BAD_RESPONSE');
    return data;
  }

  const api = {
    /** { reachable, configured, provider }: never throws. */
    async health({ signal } = {}) {
      try {
        const data = await backend('/api/health', { signal });
        return { reachable: true, configured: Boolean(data.configured), provider: data.provider || null };
      } catch {
        return { reachable: false, configured: false, provider: null };
      }
    },

    /** True when the backend stores a lecture with this id (imported with npm run import:lecture). */
    async hasServerLecture(id) {
      if (!id) return false;
      try { await backend(`/api/lectures/${encodeURIComponent(id)}`); return true; } catch { return false; }
    },

    /**
     * Who answers. A provider chosen in Settings wins; "Automatic" uses the lesson server when it
     * has this lesson and an AI provider, otherwise the pre-written sample answers.
     */
    route(lesson, health) {
      if (lesson.mode === 'prepared') return ROUTES.PREPARED;
      const ai = getAi();
      if (CLOUD.has(ai.provider)) return ai.apiKey ? ROUTES.PROVIDER : (lesson.sampleAnswers ? ROUTES.SAMPLE : ROUTES.NEEDS_KEY);
      if (ai.provider === 'ollama') return ROUTES.PROVIDER;
      if (lesson.serverId && health?.configured) return ROUTES.SERVER;
      if (lesson.sampleAnswers) return ROUTES.SAMPLE;
      return ROUTES.NEEDS_KEY;
    },

    /**
     * Runs "context" (Katchup: what was said before this slide) or "explain" for a slide.
     * `lesson` must be the lesson as heard so far (see live.mjs heardLesson): it holds no slide
     * after the live one, and the live slide's transcript only up to the last word heard.
     * Resolves { text, route, provider?, truncated? }. Rejects with LessonError.
     */
    async streamAnswer({ lesson, slideNumber, action, signal, onText = () => {}, health }) {
      if (!['context', 'explain'].includes(action)) throw new RangeError('Unknown action');
      if (signal?.aborted) throw new LessonError('ABORTED');
      if (!Number.isInteger(slideNumber) || slideNumber < 1 || slideNumber > lesson.slides.length) throw new RangeError('Slide out of range');
      const route = api.route(lesson, health);
      if (route === ROUTES.PREPARED) {
        const text = lesson.slides[slideNumber - 1][action];
        if (!text) throw new LessonError('BAD_RESPONSE');
        await reveal(text, onText, signal, { delay: revealDelay });
        return { text, route };
      }
      const sample = lesson.sampleAnswers?.[slideNumber]?.[action];

      if (action === 'context' && slideNumber === 1 && (!sample || route !== ROUTES.SAMPLE)) {
        await reveal(FIRST_SLIDE_CONTEXT, onText, signal, { delay: revealDelay });
        return { text: FIRST_SLIDE_CONTEXT, route: 'local' };
      }
      if (route === ROUTES.SAMPLE) {
        if (!sample) throw new LessonError('MISSING_KEY');
        await sleep(revealDelay * 12, signal); // a short pause, as a real request would have
        await reveal(sample, onText, signal, { delay: revealDelay });
        return { text: sample, route };
      }
      if (route === ROUTES.NEEDS_KEY) throw new LessonError('MISSING_KEY');

      if (route === ROUTES.SERVER) {
        // The server has the whole transcript; never let it read past what was heard.
        const fullyHeard = lesson.partialSlide !== slideNumber;
        const transcriptThroughSlide = action === 'context' || !fullyHeard ? slideNumber - 1 : slideNumber;
        let text;
        try {
          const answer = await backend(`/api/lectures/${encodeURIComponent(lesson.serverId)}/actions`, {
            method: 'POST', signal, body: { action, slideNumber, transcriptThroughSlide },
          });
          text = answerToMarkdown(answer);
          if (!text.trim()) throw new LessonError('BAD_RESPONSE');
        } catch (error) {
          // For the sample lesson, keep the demo going: show the pre-written answer and say why.
          if (!sample || error.code === 'ABORTED') throw error;
          await reveal(sample, onText, signal, { delay: revealDelay });
          return { text: sample, route: ROUTES.SAMPLE, fallback: error.code };
        }
        await reveal(text, onText, signal, { delay: revealDelay });
        return { text, route };
      }

      const ai = getAi();
      if (CLOUD.has(ai.provider) && !isOnline()) throw new LessonError('OFFLINE');
      const { system, user } = buildPrompt(lesson, slideNumber, action);
      const result = await streamWithProvider(ai, { system, user, signal, onText, fetchImpl });
      return { ...result, route, provider: ai.provider };
    },

    /** Better glossary definitions for a slide, from the server or the chosen provider. */
    async refineGlossary({ lesson, slideNumber, signal, health }) {
      const route = api.route(lesson, health);
      if (route === ROUTES.PREPARED) {
        if (signal?.aborted) throw new LessonError('ABORTED');
        const slide = lesson.slides[slideNumber - 1];
        if (!slide) throw new RangeError('Slide out of range');
        return { entries: slide.keywords.map(key => ({ key, ...lesson.glossary[key] })), origin: 'prepared' };
      }
      if (route === ROUTES.SERVER) {
        const fullyHeard = lesson.partialSlide !== slideNumber;
        const answer = await backend(`/api/lectures/${encodeURIComponent(lesson.serverId)}/actions`, {
          method: 'POST', signal, body: { action: 'glossary', slideNumber, transcriptThroughSlide: fullyHeard ? slideNumber : slideNumber - 1 },
        });
        return { entries: acceptGeneratedTerms(lesson, slideNumber, answer.terms, 'server'), origin: 'server' };
      }
      if (route !== ROUTES.PROVIDER) throw new LessonError('MISSING_KEY');
      const ai = getAi();
      if (CLOUD.has(ai.provider) && !isOnline()) throw new LessonError('OFFLINE');
      const { system, user } = buildPrompt(lesson, slideNumber, 'glossary');
      const { text } = await streamWithProvider(ai, { system, user, signal, fetchImpl });
      let items;
      try { items = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
      catch { throw new LessonError('BAD_RESPONSE'); }
      const entries = acceptGeneratedTerms(lesson, slideNumber, items, 'ai');
      if (!entries.length) throw new LessonError('BAD_RESPONSE');
      return { entries, origin: 'ai' };
    },
  };
  return api;
}
