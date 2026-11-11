import { LessonError, claudeErrorTypeToCode, claudeStatusToCode, isAbort } from './errors.mjs';

// Direct, streamed call to the Claude Messages API from the browser.
// Used only because the existing backend cannot accept a per-user key (it reads
// ANTHROPIC_API_KEY from its environment and its CORS policy allows no auth header).
// The project has no build step and no npm runtime dependencies, so this follows the
// backend adapter's convention (src/llm/adapter.mjs) and uses fetch over HTTP.

export const CLAUDE_URL = 'https://api.anthropic.com/v1/messages';
export const CLAUDE_MODEL = 'claude-opus-5-5';

/** Incremental parser for Server-Sent Events. Feed it text chunks; it calls onEvent(type, data). */
export function createSseParser(onEvent) {
  let buffer = '';
  const flush = raw => {
    let type = 'message';
    const data = [];
    for (const line of raw.split('\n')) {
      if (line.startsWith('event:')) type = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    if (!data.length) return;
    if (data.join('\n').trim() === '[DONE]') { onEvent('done', {}); return; } // OpenAI end marker
    let parsed;
    try { parsed = JSON.parse(data.join('\n')); } catch { throw new LessonError('BAD_RESPONSE'); }
    onEvent(parsed.type || type, parsed);
  };
  return {
    push(chunk) {
      buffer += chunk.replace(/\r\n?/g, '\n');
      let index;
      while ((index = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        flush(raw);
      }
    },
    end() { if (buffer.trim()) flush(buffer); buffer = ''; },
  };
}

/**
 * Streams a completion. Calls onText(fullTextSoFar) as text arrives.
 * Resolves { text, truncated }. Rejects with LessonError (never with raw provider text).
 */
export async function streamClaude({ apiKey, system, user, signal, onText = () => {}, fetchImpl = fetch, model = CLAUDE_MODEL }) {
  if (!apiKey) throw new LessonError('MISSING_KEY');
  let response;
  try {
    response = await fetchImpl(CLAUDE_URL, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'server-side-fallback-2026-07-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: 16000,
        stream: true,
        system,
        messages: [{ role: 'user', content: user }],
        // Short answers for a live lecture: low effort keeps latency down.
        output_config: { effort: 'low' },
        // If a safety classifier declines, the API retries on a fallback model in the same call.
        fallbacks: 'default',
      }),
    });
  } catch (error) {
    if (isAbort(error) || signal?.aborted) throw new LessonError('ABORTED');
    throw new LessonError('NETWORK');
  }
  // The response body is deliberately not read on errors: it is never shown to the user.
  if (!response.ok) throw new LessonError(claudeStatusToCode(response.status));
  if (!response.body) throw new LessonError('BAD_RESPONSE');

  let text = '';
  let stopReason = null;
  let streamError = null;
  const parser = createSseParser((type, data) => {
    if (type === 'content_block_delta' && data.delta?.type === 'text_delta') {
      text += data.delta.text;
      onText(text);
    } else if (type === 'message_delta' && data.delta?.stop_reason) {
      stopReason = data.delta.stop_reason;
    } else if (type === 'error') {
      streamError = claudeErrorTypeToCode(data.error?.type);
    }
  });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
      if (streamError) break;
    }
    parser.end();
  } catch (error) {
    if (error instanceof LessonError) throw new LessonError(error.code, { partialText: text });
    if (isAbort(error) || signal?.aborted) throw new LessonError('ABORTED', { partialText: text });
    throw new LessonError('NETWORK', { partialText: text });
  }
  if (streamError) throw new LessonError(streamError, { partialText: text });
  if (stopReason === 'refusal') throw new LessonError('REFUSED', { partialText: text });
  if (!text.trim()) throw new LessonError('BAD_RESPONSE');
  return { text, truncated: stopReason === 'max_tokens' };
}
