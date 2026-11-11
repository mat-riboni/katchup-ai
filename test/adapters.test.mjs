import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdapter } from '../src/llm/adapter.mjs';
import { readConfig } from '../src/config.mjs';

for (const provider of ['openai', 'claude', 'ollama']) {
  test(`adapter ${provider}: contratto HTTP e risposta normalizzata`, async () => {
    let request;
    const config = { ...readConfig({}), provider, model: 'test-model', apiKey: 'test-only-key' };
    const adapter = createAdapter(config, async (url, options) => {
      request = { url, ...options, body: JSON.parse(options.body) };
      return Response.json(provider === 'openai' ? { choices: [{ message: { content: '{"ok":true}' } }] }
        : provider === 'claude' ? { content: [{ type: 'text', text: '{"ok":true}' }] }
        : { message: { content: '{"ok":true}' } });
    });
    assert.equal(await adapter.complete({ system: 'JSON', user: 'contesto', schema: { type: 'object' } }), '{"ok":true}');
    assert.equal(request.body.model, 'test-model');
    if (provider === 'openai') {
      assert.equal(request.url, 'https://api.openai.com/v1/chat/completions');
      assert.equal(request.headers.Authorization, 'Bearer test-only-key');
      assert.equal(request.body.response_format.type, 'json_object');
    } else if (provider === 'claude') {
      assert.equal(request.url, 'https://api.anthropic.com/v1/messages');
      assert.equal(request.headers['x-api-key'], 'test-only-key');
      assert.equal(request.body.system, 'JSON');
      assert.equal(request.body.messages.length, 1);
    } else {
      assert.equal(request.url, 'http://127.0.0.1:11434/api/chat');
      assert.equal(request.body.stream, false);
      assert.deepEqual(request.body.format, { type: 'object' });
      assert.equal(request.headers.Authorization, undefined);
      assert.equal(request.headers['x-api-key'], undefined);
    }
  });
}

test('configurazione mancante: errore esplicito, nessuna risposta finta', async () => {
  let calls = 0;
  const adapter = createAdapter(readConfig({}), async () => { calls++; });
  await assert.rejects(adapter.complete({}), { code: 'LLM_NOT_CONFIGURED' });
  assert.equal(calls, 0);
});

test('gli errori HTTP non espongono il corpo del provider o la chiave', async () => {
  const adapter = createAdapter({ ...readConfig({ LLM_MODEL: 'test' }) }, async () => new Response('secret-error', { status: 401 }));
  await assert.rejects(adapter.complete({ system: '', user: '', schema: {} }), error => error.code === 'LLM_HTTP_ERROR' && !error.message.includes('secret-error'));
});

test('timeout e risposte del provider illeggibili sono distinguibili', async () => {
  const config = readConfig({ LLM_MODEL: 'test' });
  const timeout = createAdapter(config, async () => { throw new DOMException('timeout', 'TimeoutError'); });
  await assert.rejects(timeout.complete({}), { code: 'LLM_TIMEOUT' });
  const invalid = createAdapter(config, async () => Response.json({}));
  await assert.rejects(invalid.complete({}), { code: 'LLM_INVALID_ENVELOPE' });
});
