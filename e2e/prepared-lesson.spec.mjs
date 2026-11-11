import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const data = JSON.parse(await readFile(new URL('../web/lesson/lesson.json', import.meta.url), 'utf8'));

test('opening a panel reveals text progressively and reopening restarts it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/?start=25');
  await expect(page.locator('#symbols .symbol-row')).toHaveCount(data.slides[24].symbols.length);
  await page.locator('#tool-explain').click();
  const answer = page.locator('#ans-explain .out');
  await expect(answer).toHaveAttribute('aria-busy', 'true');
  const first = await answer.textContent();
  await expect.poll(async () => (await answer.textContent()).length).toBeGreaterThan(first.length);
  await expect(answer).toHaveAttribute('aria-busy', 'false', { timeout: 15_000 });
  const complete = await answer.textContent();
  await expect(page.locator('#ans-explain .meta')).toBeHidden();
  await page.locator('#tool-explain').click();
  await page.locator('#tool-explain').click();
  await expect(answer).toHaveAttribute('aria-busy', 'true');
  expect((await answer.textContent()).length).toBeLessThan(complete.length);
  await page.selectOption('#slide-select', '27');
  await expect(page.locator('#ans-explain .answer-h')).toHaveText('Slide 27, explained');
  await expect(answer).toHaveAttribute('aria-busy', 'false', { timeout: 15_000 });
  await expect(answer).not.toHaveText(complete);
  await expect(page.locator('#ans-explain code')).toHaveCount(0);
  await expect(page.locator('#ans-explain math').first()).toBeVisible();
  await page.locator('#tool-katchup').click();
  await page.locator('#thread-sources summary').click();
  await expect(page.locator('#thread-sources')).not.toContainText('prepared');
  await page.locator('#open-settings').click();
  await expect(page.locator('#settings-notice')).toBeHidden();
});

test('all 62 original slides have working context, explanation and glossary without external requests', async ({ page }) => {
  test.setTimeout(90_000);
  const external = [], errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin !== 'http://localhost:5174') {
      external.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  await page.goto('/');
  await expect(page.locator('#live')).toHaveAttribute('data-state', 'study');
  await expect(page.locator('#strip button')).toHaveCount(62);
  await expect(page.locator('#strip button:disabled')).toHaveCount(0);
  await expect(page.locator('#prev')).toBeDisabled();
  await expect(page.locator('#panel-gloss')).toBeVisible();
  await expect(page.locator('#panel-thread')).toBeHidden();
  await expect(page.locator('#panel-explain')).toBeHidden();
  for (const slide of data.slides) {
    await page.selectOption('#slide-select', String(slide.number));
    await expect(page.locator('#slide img')).toHaveAttribute('src', `lesson/${slide.image}`);
    await expect.poll(() => page.locator('#slide img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    await page.locator('#tool-katchup').click();
    await expect(page.locator('#panel-thread')).toBeVisible();
    await expect(page.locator('#panel-explain')).toBeHidden();
    await expect(page.locator('#ans-context .answer-h')).toHaveText(`Context for slide ${slide.number}`);
    await page.locator('#tool-explain').click();
    await expect(page.locator('#panel-thread')).toBeHidden();
    await expect(page.locator('#panel-explain')).toBeVisible();
    await expect(page.locator('#ans-explain .answer-h')).toHaveText(`Slide ${slide.number}, explained`);
    await expect(page.locator('#panel-gloss')).toBeVisible();
    await expect(page.locator('#symbols .symbol-row')).toHaveCount(slide.symbols.length);
    await expect(page.locator('#gl code, #ans-explain code')).toHaveCount(0);
    await expect(page.locator('#gl .gcard h3')).toHaveText(slide.glossary.map(g => g.term));
    await expect(page.locator('#source-pdf')).toHaveAttribute('href', `lesson/Lecture-5a.pdf#page=${slide.number}`);
  }
  await expect(page.locator('#next')).toBeDisabled();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('#ans-context')).not.toContainText('Sample answer');
  await page.locator('#slide').focus();
  await page.keyboard.press('Home');
  await expect(page.locator('#slide-select')).toHaveValue('1');
  await page.keyboard.press('End');
  await expect(page.locator('#slide-select')).toHaveValue('62');
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test('jump links, appearance, PDF and image content types', async ({ page, request }) => {
  await page.goto('/?start=46');
  await page.locator('#tool-explain').click();
  await expect(page.locator('#ans-explain')).toContainText('9.4');
  await expect(page.locator('#ans-explain')).toContainText('Slide correction');
  await page.locator('#tool-katchup').click();
  await page.locator('#thread-sources summary').click();
  await page.locator('[data-go="45"]').click();
  await expect(page.locator('#slide-select')).toHaveValue('45');
  await expect(page.locator('#ans-context .answer-h')).toHaveText('Context for slide 45');
  await page.locator('#open-settings').click();
  await expect(page.locator('#provider-choices')).toBeHidden();
  await page.getByLabel('Dark', { exact: true }).check();
  await page.locator('#settings-save').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const pdf = await request.get('/lesson/Lecture-5a.pdf');
  expect(pdf.headers()['content-type']).toBe('application/pdf');
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  const image = await request.get('/lesson/slides/slide-62.webp');
  expect(image.headers()['content-type']).toBe('image/webp');
});

test('mobile navigation and panels work without layout overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?start=58');
  await expect(page.locator('#slide img')).toBeVisible();
  await page.locator('#tool-katchup').click();
  await expect(page.locator('#ans-context')).toContainText('hidden state');
  await page.locator('#tool-explain').click();
  await expect(page.locator('#panel-thread')).toBeHidden();
  await expect(page.locator('#panel-explain')).toBeVisible();
  await expect(page.locator('#gl')).toContainText('Belief state b(h)');
  await page.keyboard.press('Escape');
  await expect(page.locator('#panel-explain')).toBeHidden();
  await expect(page.locator('#panel-gloss')).toBeVisible();
  await page.selectOption('#slide-select', '62');
  await expect(page.locator('#slide-select')).toHaveValue('62');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
