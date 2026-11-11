// AI provider settings, chosen by the user in Settings.
// Everything lives in sessionStorage: gone when the tab closes. API keys are never
// written to localStorage, the URL or logs; only their last 4 characters are shown.

export const PROVIDERS = {
  auto: { label: 'Automatic', key: false },
  claude: { label: 'Claude', key: true, prefix: 'sk-ant-' },
  openai: { label: 'OpenAI', key: true, prefix: 'sk-' },
  ollama: { label: 'Ollama (local)', key: false },
};

export const DEFAULTS = {
  provider: 'auto',
  openaiModel: 'gpt-4.1-mini',
  ollamaModel: 'gpt-oss:20b',
  ollamaUrl: 'http://127.0.0.1:11434',
};

const CONFIG = 'katchup.ai';
const keyName = provider => `katchup.key.${provider}`;

export function validateKey(provider, value) {
  const key = String(value ?? '').trim();
  const spec = PROVIDERS[provider];
  if (!spec?.key) return { ok: false, message: 'This provider does not use a key.' };
  if (!key) return { ok: false, message: `Enter your ${spec.label} API key.` };
  if (/\s/.test(key)) return { ok: false, message: 'The key cannot contain spaces.' };
  if (key.length < 20) return { ok: false, message: 'This key looks too short.' };
  if (!key.startsWith(spec.prefix)) return { ok: false, message: `${spec.label} API keys start with "${spec.prefix}".` };
  if (provider === 'openai' && key.startsWith('sk-ant-')) return { ok: false, message: 'This is a Claude key. Choose Claude as the provider.' };
  return { ok: true, key };
}

/** Ollama is reached from the browser, so only local addresses are allowed (also enforced by the page CSP). */
export function validateOllamaUrl(value) {
  const url = String(value ?? '').trim().replace(/\/+$/, '');
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}$/.test(url)) return { ok: false, message: 'Use a local address such as http://127.0.0.1:11434.' };
  return { ok: true, url };
}

export function createAiSettings(storage = globalThis.sessionStorage) {
  const memory = new Map(); // fallback when sessionStorage is blocked
  const read = name => { try { return storage?.getItem(name) ?? memory.get(name) ?? null; } catch { return memory.get(name) ?? null; } };
  const write = (name, value) => { memory.set(name, value); try { storage?.setItem(name, value); } catch { /* memory only */ } };
  const remove = name => { memory.delete(name); try { storage?.removeItem(name); } catch { /* nothing stored */ } };

  const config = () => {
    let saved = {};
    try { saved = JSON.parse(read(CONFIG) || '{}'); } catch { saved = {}; }
    const merged = { ...DEFAULTS, ...saved };
    if (!PROVIDERS[merged.provider]) merged.provider = 'auto';
    return merged;
  };

  return {
    config,
    update(patch) {
      const next = { ...config(), ...patch };
      const { provider, openaiModel, ollamaModel, ollamaUrl } = next; // never store keys here
      write(CONFIG, JSON.stringify({ provider, openaiModel, ollamaModel, ollamaUrl }));
    },
    key: provider => read(keyName(provider)),
    hasKey: provider => Boolean(read(keyName(provider))),
    setKey(provider, value) {
      const result = validateKey(provider, value);
      if (!result.ok) return result;
      write(keyName(provider), result.key);
      return { ok: true };
    },
    clearKey: provider => remove(keyName(provider)),
    hint(provider) { const key = read(keyName(provider)); return key ? key.slice(-4) : ''; },
    /** What the adapter needs for the active provider. */
    active() {
      const c = config();
      if (c.provider === 'claude') return { provider: 'claude', apiKey: read(keyName('claude')) };
      if (c.provider === 'openai') return { provider: 'openai', apiKey: read(keyName('openai')), model: c.openaiModel };
      if (c.provider === 'ollama') return { provider: 'ollama', model: c.ollamaModel, baseUrl: c.ollamaUrl };
      return { provider: 'auto' };
    },
  };
}
