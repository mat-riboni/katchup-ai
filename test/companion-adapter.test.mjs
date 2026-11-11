import test from 'node:test';
import assert from 'node:assert/strict';
import { createLessonApi, answerToMarkdown, ROUTES } from '../web/app/api/lesson.mjs';
import { createSseParser, CLAUDE_URL } from '../web/app/api/claude.mjs';
import { OPENAI_URL } from '../web/app/api/providers.mjs';
import { buildPrompt } from '../web/app/api/prompts.mjs';
import { LessonError } from '../web/app/api/errors.mjs';
import { createAiSettings, validateOllamaUrl } from '../web/app/ai-settings.mjs';
import { heardLesson } from '../web/app/live.mjs';
import { sampleLesson } from '../web/app/lesson/sample.mjs';

const CLAUDE_KEY = 'sk-ant-test-0000000000000000wxyz';
const OPENAI_KEY = 'sk-proj-test-00000000000000000abc';

const sse = events => events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
const streamBody = (text, chunkSize = 7) => new ReadableStream({
  start(controller) {
    const bytes = new TextEncoder().encode(text);
    for (let i = 0; i < bytes.length; i += chunkSize) controller.enqueue(bytes.slice(i, i + chunkSize));
    controller.close();
  },
});
const claudeStream = (parts, stop = 'end_turn') => sse([
  { type: 'message_start', message: {} },
  ...parts.map(text => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })),
  { type: 'message_delta', delta: { stop_reason: stop } },
  { type: 'message_stop' },
]);
const openaiStream = (parts, finish = 'stop') => [
  ...parts.map(content => `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: null }] })}\n\n`),
  `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: finish }] })}\n\n`,
  'data: [DONE]\n\n',
].join('');
const ollamaStream = parts => [...parts.map(content => JSON.stringify({ message: { role: 'assistant', content }, done: false })), JSON.stringify({ message: { content: '' }, done: true, done_reason: 'stop' })].join('\n') + '\n';

const claude = { provider: 'claude', apiKey: CLAUDE_KEY };
const openai = { provider: 'openai', apiKey: OPENAI_KEY, model: 'gpt-test' };
const ollama = { provider: 'ollama', model: 'llama-test', baseUrl: 'http://127.0.0.1:11434' };

const lesson = () => ({
  id: 'x', title: 'Lesson', source: 'file', glossary: {},
  slides: [
    { number: 1, title: 'Alpha intro', bullets: ['alpha basics'], transcript: 'ALPHA_TRANSCRIPT about alpha.' },
    { number: 2, title: 'Beta step', bullets: ['beta builds on alpha'], transcript: 'BETA_TRANSCRIPT about beta.' },
    { number: 3, title: 'Gamma now', bullets: ['gamma combines'], transcript: 'GAMMA_HEARD words then GAMMA_UNHEARD words.' },
    { number: 4, title: 'FUTURE_TITLE delta', bullets: ['FUTURE_BULLET'], transcript: 'FUTURE_TRANSCRIPT never sent.' },
  ],
});
// Live on slide 3, three words heard: "GAMMA_HEARD words then"
const heard = () => heardLesson(lesson(), 3, 3);

test('live: only what was heard exists — no later slides, live slide cut at the last word', () => {
  const h = heard();
  assert.equal(h.slides.length, 3);
  assert.equal(h.slides[2].transcript, 'GAMMA_HEARD words then');
  assert.equal(h.partialSlide, 3);
  assert.equal(heardLesson(lesson(), 3, 99).partialSlide, null);
});

test('prompts never contain later slides or unheard words', () => {
  for (const action of ['context', 'explain', 'glossary']) {
    const { user } = buildPrompt(heard(), 3, action);
    assert.doesNotMatch(user, /FUTURE_|GAMMA_UNHEARD/, action);
  }
  const context = buildPrompt(heard(), 3, 'context').user;
  assert.match(context, /ALPHA_TRANSCRIPT/);
  assert.match(context, /BETA_TRANSCRIPT/);
  assert.doesNotMatch(context, /GAMMA_HEARD/); // Katchup recaps what came BEFORE this slide
  const explain = buildPrompt(heard(), 3, 'explain').user;
  assert.match(explain, /GAMMA_HEARD/);
  assert.match(explain, /still talking about this slide/);
});

test('routing: chosen provider wins; Automatic uses the server for its lessons, else sample, else asks', () => {
  let ai = { provider: 'auto' };
  const api = createLessonApi({ getAi: () => ai });
  const onServer = { ...lesson(), serverId: 'x' };
  assert.equal(api.route(onServer, { configured: true }), ROUTES.SERVER);
  assert.equal(api.route(onServer, { configured: false }), ROUTES.NEEDS_KEY);
  assert.equal(api.route(sampleLesson(), {}), ROUTES.SAMPLE);
  assert.equal(api.route(lesson(), {}), ROUTES.NEEDS_KEY);
  ai = { provider: 'claude', apiKey: null };
  assert.equal(api.route(sampleLesson(), {}), ROUTES.SAMPLE);
  assert.equal(api.route(lesson(), {}), ROUTES.NEEDS_KEY);
  ai = claude;
  assert.equal(api.route(onServer, { configured: true }), ROUTES.PROVIDER);
  ai = ollama;
  assert.equal(api.route(lesson(), {}), ROUTES.PROVIDER);
});

test('sample lesson without a provider streams the pre-written answer', async () => {
  const api = createLessonApi({ revealDelay: 0, fetchImpl: () => { throw new Error('no network expected'); } });
  const s = sampleLesson();
  const result = await api.streamAnswer({ lesson: s, slideNumber: 3, action: 'context' });
  assert.equal(result.route, ROUTES.SAMPLE);
  assert.equal(result.text, s.sampleAnswers[3].context);
});

test('a lesson without sample answers and without a provider asks for one, with no request', async () => {
  let calls = 0;
  const api = createLessonApi({ revealDelay: 0, fetchImpl: async () => { calls++; } });
  await assert.rejects(api.streamAnswer({ lesson: heard(), slideNumber: 2, action: 'explain' }), e => e.code === 'MISSING_KEY');
  assert.equal(calls, 0);
});

test('first slide: Katchup answers locally without a request', async () => {
  let calls = 0;
  const api = createLessonApi({ getAi: () => claude, revealDelay: 0, fetchImpl: async () => { calls++; } });
  const result = await api.streamAnswer({ lesson: heard(), slideNumber: 1, action: 'context' });
  assert.match(result.text, /first slide/);
  assert.equal(calls, 0);
});

test('Claude: key in a header (never the URL), text streams across chunk boundaries', async () => {
  let request;
  const api = createLessonApi({
    getAi: () => claude,
    fetchImpl: async (url, init) => { request = { url, init }; return new Response(streamBody(claudeStream(['Hello ', 'there', '!'])), { status: 200 }); },
  });
  const seen = [];
  const result = await api.streamAnswer({ lesson: heard(), slideNumber: 2, action: 'explain', onText: t => seen.push(t) });
  assert.equal(result.text, 'Hello there!');
  assert.equal(result.provider, 'claude');
  assert.deepEqual(seen, ['Hello ', 'Hello there', 'Hello there!']);
  assert.equal(request.url, CLAUDE_URL);
  assert.equal(request.init.headers['x-api-key'], CLAUDE_KEY);
  assert.equal(request.init.headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.ok(!request.init.body.includes(CLAUDE_KEY));
});

test('OpenAI: bearer key, chosen model, streamed chat completions until [DONE]', async () => {
  let request;
  const api = createLessonApi({
    getAi: () => openai,
    fetchImpl: async (url, init) => { request = { url, init }; return new Response(streamBody(openaiStream(['Recap ', 'from ', 'OpenAI.'])), { status: 200 }); },
  });
  const seen = [];
  const result = await api.streamAnswer({ lesson: heard(), slideNumber: 3, action: 'context', onText: t => seen.push(t) });
  assert.equal(result.text, 'Recap from OpenAI.');
  assert.equal(result.provider, 'openai');
  assert.equal(seen.at(-1), 'Recap from OpenAI.');
  assert.equal(request.url, OPENAI_URL);
  assert.equal(request.init.headers.authorization, `Bearer ${OPENAI_KEY}`);
  const body = JSON.parse(request.init.body);
  assert.equal(body.model, 'gpt-test');
  assert.equal(body.stream, true);
  assert.doesNotMatch(request.init.body, /FUTURE_|GAMMA_UNHEARD/);
});

test('Ollama: local /api/chat, no key, newline-delimited stream', async () => {
  let request;
  const api = createLessonApi({
    getAi: () => ollama, isOnline: () => false, // works offline: it is on this computer
    fetchImpl: async (url, init) => { request = { url, init }; return new Response(streamBody(ollamaStream(['Local ', 'answer.']), 5), { status: 200 }); },
  });
  const result = await api.streamAnswer({ lesson: heard(), slideNumber: 3, action: 'explain' });
  assert.equal(result.text, 'Local answer.');
  assert.equal(request.url, 'http://127.0.0.1:11434/api/chat');
  assert.equal(JSON.parse(request.init.body).model, 'llama-test');
  assert.equal(request.init.headers.authorization, undefined);
});

test('Ollama errors: not running, model missing, origin refused', async () => {
  const run = fetchImpl => createLessonApi({ getAi: () => ollama, fetchImpl }).streamAnswer({ lesson: heard(), slideNumber: 2, action: 'context' });
  await assert.rejects(run(async () => { throw new TypeError('Failed to fetch'); }), e => e.code === 'OLLAMA_UNREACHABLE');
  await assert.rejects(run(async () => new Response('{"error":"model not found"}', { status: 404 })), e => e.code === 'MODEL_NOT_FOUND');
  await assert.rejects(run(async () => new Response('', { status: 403 })), e => e.code === 'OLLAMA_FORBIDDEN');
});

for (const [ai, status, code] of [
  [claude, 401, 'INVALID_KEY'], [claude, 429, 'RATE_LIMIT'], [claude, 529, 'OVERLOADED'], [claude, 400, 'REQUEST_REJECTED'],
  [openai, 401, 'INVALID_KEY'], [openai, 429, 'RATE_LIMIT'], [openai, 404, 'MODEL_NOT_FOUND'],
]) {
  test(`${ai.provider} HTTP ${status} → ${code}, without the provider body or the key`, async () => {
    const api = createLessonApi({
      getAi: () => ai,
      fetchImpl: async () => new Response(JSON.stringify({ error: { message: `raw provider detail ${ai.apiKey}` } }), { status }),
    });
    await assert.rejects(api.streamAnswer({ lesson: heard(), slideNumber: 2, action: 'context' }), error => {
      assert.ok(error instanceof LessonError);
      assert.equal(error.code, code);
      assert.doesNotMatch(error.message, /raw provider|sk-/);
      return true;
    });
  });
}

test('cloud providers: network failure → NETWORK; offline → OFFLINE without a request', async () => {
  const api = createLessonApi({ getAi: () => claude, fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(api.streamAnswer({ lesson: heard(), slideNumber: 2, action: 'context' }), e => e.code === 'NETWORK');
  let calls = 0;
  const offline = createLessonApi({ getAi: () => openai, isOnline: () => false, fetchImpl: async () => { calls++; } });
  await assert.rejects(offline.streamAnswer({ lesson: heard(), slideNumber: 2, action: 'context' }), e => e.code === 'OFFLINE');
  assert.equal(calls, 0);
});

test('stream errors and refusals are mapped; partial text is kept', async () => {
  const body = sse([
    { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Partial' } },
    { type: 'error', error: { type: 'overloaded_error', message: 'raw' } },
  ]);
  const api = createLessonApi({ getAi: () => claude, fetchImpl: async () => new Response(streamBody(body), { status: 200 }) });
  await assert.rejects(api.streamAnswer({ lesson: heard(), slideNumber: 2, action: 'context' }), e => e.code === 'OVERLOADED' && e.partialText === 'Partial');
  const refused = createLessonApi({ getAi: () => claude, fetchImpl: async () => new Response(streamBody(claudeStream(['No'], 'refusal')), { status: 200 }) });
  await assert.rejects(refused.streamAnswer({ lesson: heard(), slideNumber: 2, action: 'context' }), e => e.code === 'REFUSED');
});

test('aborting (slide change) rejects with ABORTED', async () => {
  const controller = new AbortController();
  const api = createLessonApi({
    getAi: () => claude,
    fetchImpl: (_, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))),
  });
  const job = api.streamAnswer({ lesson: heard(), slideNumber: 2, action: 'context', signal: controller.signal });
  controller.abort();
  await assert.rejects(job, e => e.code === 'ABORTED');
});

test('server route: existing actions contract, never past what was heard', async () => {
  const requests = [];
  const api = createLessonApi({
    revealDelay: 0,
    fetchImpl: async (url, init) => {
      requests.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ status: 'ok', summary: 'Recap.', points: [{ text: 'Point one', sourceIds: ['transcript:2'] }], terms: [], missingContext: [] }), { status: 200 });
    },
  });
  const onServer = { ...heard(), serverId: 'my-lecture' };
  const result = await api.streamAnswer({ lesson: onServer, slideNumber: 3, action: 'context', health: { configured: true } });
  assert.equal(requests[0].url, 'http://127.0.0.1:3001/api/lectures/my-lecture/actions');
  assert.deepEqual(requests[0].body, { action: 'context', slideNumber: 3, transcriptThroughSlide: 2 });
  assert.equal(result.text, 'Recap.\n\n- Point one (slide 2)');
  // Slide 3 is only partly heard: the server must not read its (full) transcript.
  await api.streamAnswer({ lesson: onServer, slideNumber: 3, action: 'explain', health: { configured: true } });
  assert.equal(requests[1].body.transcriptThroughSlide, 2);
  // Slide 2 was heard in full.
  await api.streamAnswer({ lesson: onServer, slideNumber: 2, action: 'explain', health: { configured: true } });
  assert.equal(requests[2].body.transcriptThroughSlide, 2);
});

test('server errors are mapped (busy, not configured, unreachable)', async () => {
  const onServer = { ...heard(), serverId: 'l' };
  const reply = (status, code) => createLessonApi({ revealDelay: 0, fetchImpl: async () => new Response(JSON.stringify({ error: { code, message: 'messaggio italiano' } }), { status }) });
  await assert.rejects(reply(429, 'AGENT_BUSY').streamAnswer({ lesson: onServer, slideNumber: 2, action: 'context', health: { configured: true } }), e => e.code === 'BUSY');
  await assert.rejects(reply(503, 'LLM_NOT_CONFIGURED').streamAnswer({ lesson: onServer, slideNumber: 2, action: 'context', health: { configured: true } }), e => e.code === 'SERVER_NOT_CONFIGURED' && !/italiano/.test(e.message));
  const down = createLessonApi({ fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  assert.deepEqual(await down.health(), { reachable: false, configured: false, provider: null });
  assert.equal(await down.hasServerLecture('x'), false);
  await assert.rejects(down.streamAnswer({ lesson: onServer, slideNumber: 2, action: 'context', health: { configured: true } }), e => e.code === 'BACKEND_UNREACHABLE');
});

test('sample lesson on the server: when the server AI fails, the sample answer is shown with the reason', async () => {
  const api = createLessonApi({
    revealDelay: 0,
    fetchImpl: async () => new Response(JSON.stringify({ error: { code: 'LLM_UNREACHABLE', message: 'Provider non raggiungibile' } }), { status: 502 }),
  });
  const s = { ...sampleLesson(), serverId: 'katchup-sample' };
  const result = await api.streamAnswer({ lesson: s, slideNumber: 3, action: 'context', health: { configured: true } });
  assert.equal(result.route, ROUTES.SAMPLE);
  assert.equal(result.fallback, 'SERVER_AI_UNREACHABLE');
  assert.equal(result.text, s.sampleAnswers[3].context);
  // Without sample answers, the error is shown instead.
  await assert.rejects(api.streamAnswer({ lesson: { ...heard(), serverId: 'x' }, slideNumber: 2, action: 'context', health: { configured: true } }), e => e.code === 'SERVER_AI_UNREACHABLE');
});

test('insufficient context from the server is shown, not hidden', () => {
  const md = answerToMarkdown({ status: 'insufficient_context', summary: 'Partly covered.', points: [], missingContext: ['The definition of h*'] });
  assert.match(md, /Not covered in the transcript so far/);
});

test('glossary refinement keeps only terms visible on the slide', async () => {
  const reply = JSON.stringify([{ term: 'beta', definition: 'The second idea.' }, { term: 'FUTURE_BULLET', definition: 'Dropped.' }, { term: 'unrelated', definition: 'Not on slide.' }]);
  const api = createLessonApi({ getAi: () => openai, fetchImpl: async () => new Response(streamBody(openaiStream([reply])), { status: 200 }) });
  const { entries } = await api.refineGlossary({ lesson: heard(), slideNumber: 2 });
  assert.deepEqual(entries.map(e => e.term), ['beta']);
});

test('SSE parser handles CRLF, split events and the OpenAI [DONE] marker', () => {
  const events = [];
  const parser = createSseParser((type, data) => events.push([type, data.n]));
  parser.push('event: a\r\ndata: {"type":"a","n"');
  parser.push(':1}\r\n\r\ndata: [DONE]\n\n');
  parser.end();
  assert.deepEqual(events, [['a', 1], ['done', undefined]]);
});

test('AI settings: keys per provider in sessionStorage only, last 4 shown, never in the config', () => {
  const session = new Map(); const local = new Map();
  const fake = map => ({ getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) });
  globalThis.localStorage = fake(local);
  const s = createAiSettings(fake(session));
  assert.equal(s.config().provider, 'auto');
  assert.equal(s.setKey('claude', 'not-a-key').ok, false);
  assert.equal(s.setKey('openai', CLAUDE_KEY).ok, false); // a Claude key is not an OpenAI key
  assert.equal(s.setKey('claude', ` ${CLAUDE_KEY} `).ok, true);
  assert.equal(s.setKey('openai', OPENAI_KEY).ok, true);
  s.update({ provider: 'openai', openaiModel: 'gpt-x', apiKey: OPENAI_KEY });
  assert.deepEqual(s.active(), { provider: 'openai', apiKey: OPENAI_KEY, model: 'gpt-x' });
  assert.equal(s.hint('claude'), 'wxyz');
  assert.ok(![...session.entries()].some(([k, v]) => k === 'katchup.ai' && v.includes('sk-')));
  assert.equal(local.size, 0);
  s.clearKey('openai');
  assert.equal(s.active().apiKey, null);
  delete globalThis.localStorage;
});

test('Ollama address must be local', () => {
  assert.equal(validateOllamaUrl('http://127.0.0.1:11434/').url, 'http://127.0.0.1:11434');
  assert.equal(validateOllamaUrl('http://localhost:11434').ok, true);
  assert.equal(validateOllamaUrl('https://evil.example.com').ok, false);
});
