import { AppError } from '../errors.mjs';

// Contratto unico: complete({ system, user, schema }) -> Promise<string JSON>.
// Nessun SDK o framework di agenti necessario per queste tre azioni.
export function createAdapter(config, fetchImpl = fetch) {
  return {
    async complete({ system, user, schema }) {
      if (!config.model || (config.provider !== 'ollama' && !config.apiKey)) {
        throw new AppError(503, 'LLM_NOT_CONFIGURED', 'Imposta LLM_MODEL e la chiave API del provider scelto in .env');
      }
      let url, body;
      const headers = { 'Content-Type': 'application/json' };
      const messages = [{ role: 'system', content: system }, { role: 'user', content: user }];
      if (config.provider === 'openai') {
        url = 'https://api.openai.com/v1/chat/completions';
        headers.Authorization = `Bearer ${config.apiKey}`;
        body = { model: config.model, messages, response_format: { type: 'json_object' }, max_completion_tokens: 3000 };
      } else if (config.provider === 'claude') {
        url = 'https://api.anthropic.com/v1/messages';
        headers['x-api-key'] = config.apiKey;
        headers['anthropic-version'] = config.anthropicVersion;
        body = { model: config.model, system, messages: [{ role: 'user', content: user }], max_tokens: 3000 };
      } else {
        url = `${config.ollamaBaseUrl.replace(/\/$/, '')}/api/chat`;
        body = { model: config.model, messages, format: schema, stream: false, options: { num_predict: 3000 } };
      }
      let response;
      try {
        response = await fetchImpl(url, {
          method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(config.timeoutMs),
        });
      } catch (error) {
        const timeout = ['TimeoutError', 'AbortError'].includes(error.name);
        throw new AppError(timeout ? 504 : 502, timeout ? 'LLM_TIMEOUT' : 'LLM_UNREACHABLE',
          timeout ? 'Il modello non ha risposto in tempo' : 'Provider non raggiungibile');
      }
      if (!response.ok) throw new AppError(502, 'LLM_HTTP_ERROR', `Il provider ha restituito HTTP ${response.status}`);
      try {
        const data = await response.json();
        const result = config.provider === 'openai' ? data.choices?.[0]?.message?.content
          : config.provider === 'claude' ? data.content?.filter(block => block.type === 'text').map(block => block.text).join('\n')
          : data.message?.content;
        if (typeof result !== 'string' || !result.trim()) throw new Error('Risposta vuota');
        return result;
      } catch {
        throw new AppError(502, 'LLM_INVALID_ENVELOPE', 'Formato della risposta del provider non valido');
      }
    },
  };
}
