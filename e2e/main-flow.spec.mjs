import { test, expect } from '@playwright/test';

const CLAUDE_KEY = 'sk-ant-e2e-test-key-000000000000abcd';
const OPENAI_KEY = 'sk-proj-e2e-test-key-0000000000wxyz';
const API = 'http://127.0.0.1:3001';

const claudeSse = parts => [
  { type: 'message_start', message: {} },
  ...parts.map(text => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })),
  { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
  { type: 'message_stop' },
].map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
const openaiSse = parts => [...parts.map(content => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`), 'data: [DONE]\n\n'].join('');
const ollamaNdjson = parts => [...parts.map(content => JSON.stringify({ message: { content }, done: false })), JSON.stringify({ done: true, done_reason: 'stop' })].join('\n');

// Default: lesson server down, no AI provider reachable.
test.beforeEach(async ({ page }) => {
  // Legacy flows deliberately exercise the built-in sample, independently of the shipped deck.
  await page.route('**/lesson/lesson.json', route => route.fulfill({ status: 404, body: 'No lesson fixture' }));
  await page.route(`${API}/**`, route => route.abort('connectionrefused'));
  await page.route('https://api.anthropic.com/**', route => route.abort('failed'));
  await page.route('https://api.openai.com/**', route => route.abort('failed'));
  await page.route('http://127.0.0.1:11434/**', route => route.abort('connectionrefused'));
});

// Opens a page and waits until the lesson is loaded (shortcuts work from then on).
async function open(page, url) { await page.goto(url); await expect(page.locator('#live[data-state]')).toHaveCount(1); }
const panel = (page, name) => page.getByRole('dialog', { name });
const tool = (page, name) => page.getByRole('toolbar', { name: 'Katchup tools' }).getByRole('button', { name: new RegExp(`^${name}`) });

test('first load: only the slide, the live strip and the three tools; nothing in the header but the brand', async ({ page }) => {
  await open(page, '/?paused');
  await expect(page.locator('.top')).toContainText('Katchup');
  await expect(page.locator('.top button')).toHaveCount(0);
  await expect(page.locator('#slide')).toContainText('Linear classifier'); // the sample lecture is live on slide 4
  await expect(page.locator('#live')).toBeVisible();
  await expect(panel(page, 'Katchup')).toBeHidden();
  await expect(panel(page, 'Glossary')).toBeHidden();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('#intro')).toBeHidden();
  for (const name of ['Katchup', 'Explain this slide', 'Glossary']) await expect(tool(page, name)).toBeVisible();
  // Slides not presented yet cannot be opened.
  await expect(page.getByRole('button', { name: 'Slide 5: not presented yet' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Next slide' })).toBeDisabled();
});

test('the two left panels are mutually exclusive and restore focus when closed', async ({ page }) => {
  await open(page, '/?paused&start=3');
  await page.keyboard.press('k');
  const context = panel(page, 'Katchup');
  const explanation = panel(page, 'Explain this slide');
  await expect(context.locator('#ans-context')).toContainText('To remember');
  await expect(explanation).toBeHidden();
  await tool(page, 'Explain this slide').click();
  await expect(context).toBeHidden();
  await expect(explanation.locator('#ans-explain')).toContainText('Step by step');
  await page.keyboard.press('g');
  const gloss = panel(page, 'Glossary');
  await expect(gloss.locator('.gcard h3')).toHaveText(['Perceptron', 'Weights', 'Bias', 'Step function', 'Logistic regression']);
  await expect(explanation).toBeVisible();
  await page.getByRole('button', { name: 'Previous slide' }).click();
  await expect(page.locator('#gloss-sub')).toHaveText(/Slide 2/);
  await expect(explanation.locator('#ans-explain .answer-h')).toHaveText('Slide 2, explained');
  await expect(context).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(gloss).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(explanation).toBeHidden();
  await expect(tool(page, 'Explain this slide')).toBeFocused();
});

test('live: the transcript arrives word by word; the slide follows the professor unless you are reading', async ({ page }) => {
  await open(page, '/?start=1&speed=8');
  const text = page.locator('#live-text');
  await expect(text).not.toHaveText('…');
  const first = await text.textContent();
  await expect(text).not.toHaveText(first);
  // Following the lecturer: the slide moves on by itself.
  await expect(page.locator('#slide')).toContainText('Mini-batch SGD', { timeout: 15_000 });
  // Reading a panel: the student stays, and can jump back to live.
  await page.keyboard.press('g');
  await expect(page.locator('#slide')).toContainText('Mini-batch SGD');
  await expect(page.locator('#back-live')).toHaveText(/Live is on slide 3/, { timeout: 15_000 });
  await expect(page.locator('#slide')).toContainText('Mini-batch SGD');
  await page.locator('#back-live').click();
  await expect(page.locator('#slide')).toContainText('The perceptron');
  // Pause and resume.
  await page.getByRole('button', { name: 'Pause the lecture' }).click();
  await expect(page.locator('#live')).toHaveAttribute('data-state', 'paused');
  await page.getByRole('button', { name: 'Resume the lecture' }).click();
  await expect(page.locator('#live')).toHaveAttribute('data-state', 'live');
});

test('glossary and slide are linked: hover highlights, clicking a keyword opens the glossary on it', async ({ page }) => {
  await open(page, '/?paused&start=1');
  await page.locator('#slide .kw', { hasText: 'learning rate' }).click();
  const gloss = panel(page, 'Glossary');
  await expect(gloss.locator('.gcard[data-k="lr"]')).toBeFocused();
  await gloss.locator('.gcard[data-k="momentum"]').hover();
  await expect(page.locator('#slide .kw.hl')).toHaveText(['Momentum']);
});

test('Claude: key in sessionStorage only, masked; live answer streamed from what was heard', async ({ page }) => {
  let request = null;
  await page.route('https://api.anthropic.com/v1/messages', async route => {
    request = route.request();
    await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: claudeSse(['Earlier, the lecturer ', 'defined the **loss function**.']) });
  });
  await open(page, '/?paused&start=2');
  await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByLabel(/Claude/).check();
  const input = page.getByLabel('API key', { exact: true });
  await expect(input).toHaveAttribute('type', 'password');
  await input.fill('not-a-claude-key-but-long-enough');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#settings-error')).toContainText('sk-ant-');
  await input.fill(CLAUDE_KEY);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#toast')).toContainText('••••abcd');
  await expect(page.locator('body')).not.toContainText(CLAUDE_KEY);
  const storage = await page.evaluate(() => ({ session: { ...sessionStorage }, local: { ...localStorage } }));
  expect(Object.values(storage.session)).toContain(CLAUDE_KEY);
  expect(JSON.stringify(storage.local)).not.toContain('sk-');
  expect(page.url()).not.toContain('sk-');

  await page.keyboard.press('k');
  const thread = panel(page, 'Katchup');
  await expect(thread.locator('#ans-context')).toContainText('Earlier, the lecturer defined the loss function.');
  await expect(thread).toContainText('Generated live by Claude from what was said on slide 1');
  expect(request.headers()['x-api-key']).toBe(CLAUDE_KEY);
  const body = JSON.stringify(request.postDataJSON());
  expect(body).not.toContain('Backpropagation applies'); // later slides are never sent
  expect(body).not.toContain('In plain gradient descent'); // slide 2 not heard yet (paused at its first word)
});

test('OpenAI: chosen in Settings, answers stream from the chat completions API', async ({ page }) => {
  let request = null;
  await page.route('https://api.openai.com/v1/chat/completions', async route => {
    request = route.request();
    await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: openaiSse(['A perceptron ', 'combines weights.']) });
  });
  await open(page, '/?paused&start=3');
  await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByLabel(/OpenAI/).check();
  await page.getByLabel('API key', { exact: true }).fill(OPENAI_KEY);
  await page.locator('#openai-model').fill('gpt-test-model');
  await page.getByRole('button', { name: 'Save' }).click();
  await tool(page, 'Explain this slide').click();
  const thread = panel(page, 'Explain this slide');
  await expect(panel(page, 'Explain this slide').locator('#ans-explain')).toContainText('A perceptron combines weights.');
  await expect(thread).toContainText('Generated live by OpenAI');
  expect(request.headers().authorization).toBe(`Bearer ${OPENAI_KEY}`);
  expect(request.postDataJSON().model).toBe('gpt-test-model');
});

test('Ollama: local model, no key; clear error when it is not running', async ({ page }) => {
  await open(page, '/?paused&start=3');
  await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByLabel(/Ollama/).check();
  await expect(page.getByLabel('API key', { exact: true })).toBeHidden();
  await page.locator('#ollama-model').fill('llama-test');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.keyboard.press('k');
  const thread = panel(page, 'Katchup');
  await expect(thread).toContainText('Ollama cannot be reached');

  await page.unroute('http://127.0.0.1:11434/**');
  let body = null;
  await page.route('http://127.0.0.1:11434/api/chat', async route => {
    body = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: ollamaNdjson(['Before this slide, ', 'the lecturer covered SGD.']) });
  });
  await thread.getByRole('button', { name: 'Retry' }).click();
  await expect(thread.locator('#ans-context')).toContainText('Before this slide, the lecturer covered SGD.');
  await expect(thread).toContainText('Generated live by Ollama');
  expect(body.model).toBe('llama-test');
});

test('invalid key (401) and rate limit (429): clear errors with retry, never the raw provider message', async ({ page }) => {
  let status = 401;
  await page.route('https://api.anthropic.com/v1/messages', route => route.fulfill({ status, body: JSON.stringify({ error: { message: 'RAW PROVIDER DETAIL' } }) }));
  await open(page, '/?paused&start=2');
  await page.evaluate(key => {
    sessionStorage.setItem('katchup.key.claude', key);
    sessionStorage.setItem('katchup.ai', JSON.stringify({ provider: 'claude' }));
  }, CLAUDE_KEY);
  await page.reload();
  await expect(page.locator('#live[data-state]')).toHaveCount(1);
  await page.keyboard.press('k');
  const thread = panel(page, 'Katchup');
  await expect(thread).toContainText('The provider rejected this API key');
  await expect(thread).not.toContainText('RAW PROVIDER DETAIL');
  status = 429;
  await thread.getByRole('button', { name: 'Retry' }).click();
  await expect(thread).toContainText('Too many requests');
});

test("the professor's lesson from web/lesson/lesson.json: real slide image, auto glossary, asks for a provider", async ({ page }) => {
  await page.route('**/lesson/lesson.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    id: 'graphs-1', title: 'Graph basics', course: 'Discrete maths',
    slides: [
      { number: 1, title: 'Nodes', text: 'A node stores a value.', transcript: 'A node is a single point of the graph that stores a value.' },
      { number: 2, title: 'Edges', text: 'An edge connects two nodes. Edges can carry a weight.', image: 'slides/slide-02.svg', transcript: 'An edge is a connection between two nodes. A weight is a number attached to an edge.' },
    ],
  }) }));
  await page.route('**/lesson/slides/slide-02.svg', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90"><rect width="160" height="90" fill="#eee"/></svg>' }));
  await open(page, '/?paused&start=2');
  await expect(page.locator('.top')).toContainText('Graph basics · Discrete maths');
  await expect(page.locator('#slide img')).toHaveAttribute('src', 'lesson/slides/slide-02.svg');
  await expect(page.locator('#slide img')).toHaveAttribute('alt', /An edge connects two nodes/);
  // Live on slide 2 but nothing said on it yet: terms come from what was heard.
  await page.keyboard.press('g');
  await expect(panel(page, 'Glossary')).toContainText(/Node/);
  await page.keyboard.press('k');
  await expect(page.locator('#settings')).toBeVisible();
  await expect(page.locator('#settings-notice')).toContainText('Choose an AI provider');
  await page.keyboard.press('Escape');
  await expect(panel(page, 'Katchup')).toContainText('Live answers need an AI provider');
});

test('lesson server: a lesson imported with the same id is answered by the existing actions endpoint', async ({ page }) => {
  await page.unroute(`${API}/**`);
  const actions = [];
  await page.route(`${API}/**`, async route => {
    const url = new URL(route.request().url());
    const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/health') return json({ status: 'ok', provider: 'ollama', configured: true });
    if (url.pathname === '/api/lectures/search-1') return json({ id: 'search-1', title: 'Search', slides: [] });
    if (url.pathname === '/api/lectures/search-1/actions') {
      actions.push(route.request().postDataJSON());
      return json({ status: 'ok', summary: 'g(n) was defined as the cost so far.', points: [{ text: 'g(n) is the cost already paid', sourceIds: ['transcript:1'] }], terms: [], missingContext: [] });
    }
    return route.fulfill({ status: 404, body: '{}' });
  });
  await page.route('**/lesson/lesson.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    id: 'search-1', title: 'Heuristic search',
    slides: [
      { number: 1, title: 'Path cost', text: 'g(n): cost of the path so far.', transcript: 'We call g of n the cost of the path so far.' },
      { number: 2, title: 'Heuristics', text: 'h(n): estimated cost to the goal.', transcript: 'The heuristic estimates the remaining cost.' },
    ],
  }) }));
  await open(page, '/?paused&start=2');
  await page.keyboard.press('k');
  await expect(panel(page, 'Katchup')).toContainText('g(n) is the cost already paid (slide 1)');
  await expect(panel(page, 'Katchup')).toContainText('Generated by the lesson server');
  expect(actions[0]).toEqual({ action: 'context', slideNumber: 2, transcriptThroughSlide: 1 });
});

test('sample lesson seeded on the server: answered by the backend; if its AI is down, sample answer with the reason', async ({ page }) => {
  await page.unroute(`${API}/**`);
  let aiUp = true;
  const actions = [];
  await page.route(`${API}/**`, async route => {
    const url = new URL(route.request().url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/health') return json({ status: 'ok', provider: 'ollama', configured: true });
    if (url.pathname === '/api/lectures/katchup-sample') return json({ id: 'katchup-sample', title: 'x', slides: [] });
    if (url.pathname === '/api/lectures/katchup-sample/actions') {
      actions.push(route.request().postDataJSON());
      return aiUp
        ? json({ status: 'ok', summary: 'Server recap of slides 1 and 2.', points: [], terms: [], missingContext: [] })
        : json({ error: { code: 'LLM_UNREACHABLE', message: 'Provider non raggiungibile' } }, 502);
    }
    return route.fulfill({ status: 404, body: '{}' });
  });
  await open(page, '/?paused&start=3');
  await page.keyboard.press('k');
  const thread = panel(page, 'Katchup');
  await expect(thread.locator('#ans-context')).toContainText('Server recap of slides 1 and 2.');
  await expect(thread).toContainText('Generated by the lesson server (ollama)');
  expect(actions[0]).toEqual({ action: 'context', slideNumber: 3, transcriptThroughSlide: 2 });

  aiUp = false;
  await tool(page, 'Explain this slide').click();
  await expect(panel(page, 'Explain this slide').locator('#ans-explain')).toContainText('The lesson server cannot reach its AI provider');
  await expect(panel(page, 'Explain this slide').locator('#ans-explain')).toContainText('Step by step');
  await expect(panel(page, 'Explain this slide').locator('#ans-explain')).not.toContainText('non raggiungibile');
  aiUp = true;
  await panel(page, 'Explain this slide').getByRole('button', { name: 'Ask the server again' }).click();
  await expect(panel(page, 'Explain this slide').locator('#ans-explain')).toContainText('Server recap of slides 1 and 2.');
});

test('below 1000px: tools in a bottom bar, panels as bottom sheets, one at a time', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, '/?paused');
  await tool(page, 'Katchup').click();
  await expect(panel(page, 'Katchup')).toBeVisible();
  await tool(page, 'Glossary').click();
  await expect(panel(page, 'Glossary')).toBeVisible();
  await expect(panel(page, 'Katchup')).toBeHidden();
  const box = await panel(page, 'Glossary').boundingBox();
  const bar = await page.locator('.tools').boundingBox();
  expect(Math.round(box.width)).toBe(390);
  expect(Math.abs(box.y + box.height - bar.y)).toBeLessThan(8);
  expect(Math.round(bar.y + bar.height)).toBe(844);
});

test('presentation: three beats with Skip, then a walkthrough of the three tools', async ({ page }) => {
  await open(page, '/?paused#present');
  const intro = page.locator('#intro');
  await expect(intro).toBeVisible();
  await expect(intro).toContainText('As we saw earlier');
  await expect(intro.locator('.qmark')).toHaveCount(2);
  await intro.getByRole('button', { name: 'Next' }).click();
  await expect(intro).toContainText('Catch up without leaving the slide');
  await intro.getByRole('button', { name: 'Next' }).click();
  await expect(intro).toContainText('Everything is one click away');
  await expect(intro.getByRole('button', { name: 'Skip' })).toBeVisible();
  await intro.getByRole('button', { name: 'Start the walkthrough' }).click();
  await expect(intro).toBeHidden();
  const tip = page.locator('#coach-tip');
  await expect(tip).toContainText('Step 1 of 3');
  await tip.getByRole('button', { name: 'Next' }).click();
  await expect(panel(page, 'Katchup').locator('#ans-context')).toBeVisible();
  await expect(tip).toContainText('Explain this slide');
  await tip.getByRole('button', { name: 'Next' }).click();
  await expect(panel(page, 'Explain this slide').locator('#ans-explain')).toBeVisible();
  await expect(panel(page, 'Katchup')).toBeHidden();
  await expect(tip).toContainText('Glossary');
  await tip.getByRole('button', { name: 'Finish' }).click();
  await expect(panel(page, 'Glossary')).toBeVisible();
  await expect(page.locator('#coach')).toBeHidden();

  await page.keyboard.press('p');
  await expect(intro).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(intro).toBeHidden();
});

test('all visible text is English', async ({ page }) => {
  await open(page, '/?paused#present');
  const texts = [await page.locator('body').innerText()];
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.keyboard.press('k');
  await page.keyboard.press('g');
  texts.push(await page.locator('body').innerText());
  const italian = /\b(della|delle|nella|perché|questa|lezione|spiega|carica|riprova|errore|chiave|glossario)\b/i;
  for (const text of texts) expect(text).not.toMatch(italian);
});
