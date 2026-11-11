import { LessonError, isAbort } from './errors.mjs';
import { createSseParser, streamClaude } from './claude.mjs';

// Browser clients for the providers a user can pick in Settings. Same contract for all:
// stream({ system, user, signal, onText }) → { text, truncated }, errors as LessonError.
// The backend (src/llm/adapter.mjs) supports the same three providers, but only with
// credentials from its .env, so a provider chosen in the UI is called from the browser.

export const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

function openaiStatusToCode(status) {
  if (status === 401 || status === 403) return 'INVALID_KEY';
  if (status === 429) return 'RATE_LIMIT';
  if (status === 404) return 'MODEL_NOT_FOUND';
  if (status === 503) return 'OVERLOADED';
  if (status >= 400 && status < 500) return 'REQUEST_REJECTED';
  return 'UNKNOWN';
}

async function readStream(response, signal, onChunk, text) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (onChunk(decoder.decode(value, { stream: true })) === false) break;
    }
  } catch (error) {
    if (error instanceof LessonError) throw new LessonError(error.code, { partialText: text() });
    if (isAbort(error) || signal?.aborted) throw new LessonError('ABORTED', { partialText: text() });
    throw new LessonError('NETWORK', { partialText: text() });
  }
}

export async function streamOpenAI({ apiKey, model, system, user, signal, onText = () => {}, fetchImpl = fetch }) {
  if (!apiKey) throw new LessonError('MISSING_KEY');
  let response;
  try {
    response = await fetchImpl(OPENAI_URL, {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, stream: true, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    });
  } catch (error) {
    if (isAbort(error) || signal?.aborted) throw new LessonError('ABORTED');
    throw new LessonError('NETWORK');
  }
  if (!response.ok) throw new LessonError(openaiStatusToCode(response.status));
  if (!response.body) throw new LessonError('BAD_RESPONSE');
  let text = '', finish = null;
  const parser = createSseParser((type, data) => {
    if (type === 'done') return;
    if (data.error) throw new LessonError('UNKNOWN');
    const choice = data.choices?.[0];
    if (choice?.delta?.content) { text += choice.delta.content; onText(text); }
    if (choice?.finish_reason) finish = choice.finish_reason;
  });
  await readStream(response, signal, chunk => parser.push(chunk), () => text);
  parser.end();
  if (finish === 'content_filter') throw new LessonError('REFUSED', { partialText: text });
  if (!text.trim()) throw new LessonError('BAD_RESPONSE');
  return { text, truncated: finish === 'length' };
}

export async function streamOllama({ baseUrl, model, system, user, signal, onText = () => {}, fetchImpl = fetch }) {
  let response;
  try {
    response = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/api/chat`, {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, stream: true, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    });
  } catch (error) {
    if (isAbort(error) || signal?.aborted) throw new LessonError('ABORTED');
    throw new LessonError('OLLAMA_UNREACHABLE');
  }
  if (response.status === 404) throw new LessonError('MODEL_NOT_FOUND');
  if (response.status === 403) throw new LessonError('OLLAMA_FORBIDDEN');
  if (!response.ok) throw new LessonError('UNKNOWN');
  if (!response.body) throw new LessonError('BAD_RESPONSE');
  // Newline-delimited JSON: { message: { content }, done, done_reason }
  let text = '', buffer = '', reason = null;
  const line = raw => {
    if (!raw.trim()) return;
    let data;
    try { data = JSON.parse(raw); } catch { throw new LessonError('BAD_RESPONSE'); }
    if (data.error) throw new LessonError('UNKNOWN');
    if (data.message?.content) { text += data.message.content; onText(text); }
    if (data.done) reason = data.done_reason || 'stop';
  };
  await readStream(response, signal, chunk => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf('\n')) !== -1) { line(buffer.slice(0, index)); buffer = buffer.slice(index + 1); }
  }, () => text);
  line(buffer);
  if (!text.trim()) throw new LessonError('BAD_RESPONSE');
  return { text, truncated: reason === 'length' };
}

/** Dispatches to the provider chosen in Settings. */
export function streamWithProvider(ai, { system, user, signal, onText, fetchImpl }) {
  if (ai.provider === 'claude') return streamClaude({ apiKey: ai.apiKey, system, user, signal, onText, fetchImpl });
  if (ai.provider === 'openai') return streamOpenAI({ apiKey: ai.apiKey, model: ai.model, system, user, signal, onText, fetchImpl });
  if (ai.provider === 'ollama') return streamOllama({ baseUrl: ai.baseUrl, model: ai.model, system, user, signal, onText, fetchImpl });
  throw new LessonError('MISSING_KEY');
}
