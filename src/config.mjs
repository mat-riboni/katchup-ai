import { fileURLToPath } from 'node:url';

export function readConfig(env = process.env) {
  const provider = env.LLM_PROVIDER || 'ollama';
  if (!['openai', 'claude', 'ollama'].includes(provider)) throw new Error('LLM_PROVIDER non valido');
  const port = Number(env.PORT || 3001);
  const timeoutMs = Number(env.LLM_TIMEOUT_MS || 60000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT non valida');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 180000) throw new Error('LLM_TIMEOUT_MS non valido');
  return {
    provider, model: env.LLM_MODEL || '', port, timeoutMs,
    apiKey: provider === 'openai' ? env.OPENAI_API_KEY : env.ANTHROPIC_API_KEY,
    ollamaBaseUrl: env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
    anthropicVersion: env.ANTHROPIC_VERSION || '2023-06-01',
    webOrigin: env.WEB_ORIGIN || 'http://localhost:5173',
    dataDir: fileURLToPath(new URL('../data/', import.meta.url)),
    exampleDir: fileURLToPath(new URL('../examples/', import.meta.url)),
  };
}
