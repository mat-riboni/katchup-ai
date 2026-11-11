import { $ } from './render.mjs';
import { PROVIDERS, validateKey, validateOllamaUrl } from '../ai-settings.mjs';

// Settings dialog: AI provider (Automatic, Claude, OpenAI, Ollama), key, model, theme.
// Key inputs are never pre-filled; only the last 4 characters of a saved key are shown.

const THEME_KEY = 'katchup.theme';
const readTheme = () => { try { return localStorage.getItem(THEME_KEY) || 'system'; } catch { return 'system'; } };

export function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* theme is a convenience only */ }
}

export function initSettings(app) {
  const dialog = $('#settings');
  const form = $('#settings-form');
  const notice = $('#settings-notice');
  const error = $('#settings-error');
  const keyInput = $('#key-input');
  const keyState = $('#key-state');
  const fields = { openaiModel: $('#openai-model'), ollamaUrl: $('#ollama-url'), ollamaModel: $('#ollama-model') };

  applyTheme(readTheme());

  const selected = () => form.querySelector('input[name="provider"]:checked')?.value || 'auto';

  function renderFields() {
    const provider = selected();
    form.querySelectorAll('.pfields').forEach(box => { box.hidden = !box.dataset.for.split(' ').includes(provider); });
    if (PROVIDERS[provider].key) {
      const has = app.ai.hasKey(provider);
      keyState.dataset.has = String(has);
      keyState.textContent = has ? `${PROVIDERS[provider].label} key saved for this tab: ••••${app.ai.hint(provider)}` : `No ${PROVIDERS[provider].label} key saved.`;
      keyInput.placeholder = has ? 'Paste a new key to replace it' : `${PROVIDERS[provider].prefix}…`;
      $('#key-remove').disabled = !has;
    }
    error.textContent = '';
  }

  function renderServer(health) {
    $('#server-state').textContent = !health.reachable
      ? 'The lesson server is not running, so the sample answers are used. Start it with "npm start" to use the AI provider configured in its .env.'
      : !app.state.lesson?.serverId
        ? `The lesson server is running${health.configured ? ` (${health.provider})` : ''}, but it does not have this lesson. ${app.state.lesson?.source === 'sample' ? 'Run "npm run seed:sample", then reload,' : 'Import web/lesson/lesson.json into it'} to use its AI. Until then, sample answers are used.`
        : health.configured
          ? `The lesson server answers with ${health.provider}, configured in its .env. The key stays on the server.`
          : 'The lesson server has this lesson but no AI provider configured in its .env.';
  }

  function save() {
    if (app.state.lesson?.mode === 'prepared') { dialog.close(); app.toast('Appearance saved'); return; }
    const provider = selected();
    const patch = { provider };
    if (PROVIDERS[provider].key) {
      const typed = keyInput.value.trim();
      if (typed) {
        const check = validateKey(provider, typed);
        if (!check.ok) { error.textContent = check.message; keyInput.focus(); return; }
      } else if (!app.ai.hasKey(provider)) {
        error.textContent = `Enter your ${PROVIDERS[provider].label} API key.`; keyInput.focus(); return;
      }
      if (typed) app.ai.setKey(provider, typed);
    }
    if (provider === 'openai') {
      const model = fields.openaiModel.value.trim();
      if (!model) { error.textContent = 'Enter a model name.'; fields.openaiModel.focus(); return; }
      patch.openaiModel = model;
    }
    if (provider === 'ollama') {
      const url = validateOllamaUrl(fields.ollamaUrl.value);
      if (!url.ok) { error.textContent = url.message; fields.ollamaUrl.focus(); return; }
      const model = fields.ollamaModel.value.trim();
      if (!model) { error.textContent = 'Enter the name of a model you pulled with Ollama.'; fields.ollamaModel.focus(); return; }
      Object.assign(patch, { ollamaUrl: url.url, ollamaModel: model });
    }
    app.ai.update(patch);
    keyInput.value = '';
    dialog.close();
    app.onAiChange();
    const hint = PROVIDERS[provider].key ? ` (key ••••${app.ai.hint(provider)})` : provider === 'ollama' ? ` (${patch.ollamaModel})` : '';
    app.toast(`AI provider: ${PROVIDERS[provider].label}${hint}`);
  }

  form.addEventListener('change', e => {
    if (e.target.name === 'provider') renderFields();
    if (e.target.name === 'theme') applyTheme(e.target.value);
  });
  $('#settings-save').addEventListener('click', save);
  form.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input[type="text"], input[type="password"]')) { e.preventDefault(); save(); } });
  form.addEventListener('input', () => { error.textContent = ''; });
  $('#key-remove').addEventListener('click', () => {
    const provider = selected();
    app.ai.clearKey(provider);
    keyInput.value = '';
    renderFields();
    app.onAiChange();
    app.toast(`${PROVIDERS[provider].label} key removed`);
    keyInput.focus();
  });
  dialog.addEventListener('close', () => { keyInput.value = ''; error.textContent = ''; });
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });

  const api = {
    open({ notice: text = '' } = {}) {
      const config = app.ai.config();
      notice.hidden = !text;
      notice.textContent = text;
      form.querySelectorAll('input[name="provider"]').forEach(r => { r.checked = r.value === config.provider; });
      form.querySelectorAll('input[name="theme"]').forEach(r => { r.checked = r.value === readTheme(); });
      fields.openaiModel.value = config.openaiModel;
      fields.ollamaUrl.value = config.ollamaUrl;
      fields.ollamaModel.value = config.ollamaModel;
      keyInput.value = '';
      renderFields();
      if (app.state.lesson?.mode === 'prepared') {
        if (!dialog.open) dialog.showModal();
        form.querySelector('input[name="theme"]:checked')?.focus();
        return;
      }
      renderServer(app.state.health);
      if (!dialog.open) dialog.showModal();
      form.querySelector('input[name="provider"]:checked')?.focus();
      app.refreshHealth().then(renderServer);
    },
  };
  $('#open-settings').addEventListener('click', () => api.open());
  return api;
}
