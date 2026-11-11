import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { readConfig } from '../src/config.mjs';
import { createApp } from '../src/app.mjs';
import { LectureStore } from '../src/lectures/store.mjs';
import { LectureAgent } from '../src/agent/agent.mjs';
import { importLecture } from '../scripts/import-lecture.mjs';
import { createApi } from '../web/api.mjs';

async function setup(t, complete) {
  const dataDir = await mkdtemp(join(tmpdir(), 'lecture-test-'));
  const config = { ...readConfig({}), dataDir };
  const store = new LectureStore(dataDir, config.exampleDir);
  const agent = new LectureAgent({ complete: complete || (async () => JSON.stringify({ status: 'ok', summary: 'Costo accumulato.',
    points: [{ text: 'g(n) indica il costo accumulato.', sourceIds: ['transcript:1'] }], terms: [], missingContext: [] })) });
  const server = createApp({ config, store, agent });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(dataDir, { recursive: true, force: true }); });
  return { dataDir, config, store, url: `http://127.0.0.1:${server.address().port}` };
}

test('API e client web: elenco, lezione e azione attraverso HTTP reale', async t => {
  const { url } = await setup(t);
  const client = createApi(url);
  assert.equal((await client.listLectures())[0].id, 'demo');
  const lesson = await client.getLecture('demo');
  assert.equal(lesson.slides.length, 4);
  assert.equal(client.pdfUrl(lesson, 1), null);
  const answer = await client.runAction('demo', { action: 'context', slideNumber: 3 });
  assert.equal(answer.sources[0].id, 'transcript:1');
  assert.equal(answer.slideNumber, 3);
});

test('importa manifest e PDF, serve il documento e non sovrascrive lezioni', async t => {
  const { url, dataDir, store } = await setup(t);
  const manifest = JSON.parse(await readFile(new URL('../examples/demo/lecture.json', import.meta.url), 'utf8'));
  manifest.id = 'nuova-lezione';
  const manifestPath = join(dataDir, 'input.json'); const pdfPath = join(dataDir, 'input.pdf');
  await writeFile(manifestPath, JSON.stringify(manifest));
  // Firma sintetica: verifica il trasporto, non il rendering di un PDF.
  await writeFile(pdfPath, '%PDF-1.4\nfixture\n%%EOF');
  assert.equal(await importLecture(manifestPath, pdfPath, dataDir), 'nuova-lezione');
  await assert.rejects(importLecture(manifestPath, pdfPath, dataDir), { code: 'EEXIST' });
  assert.equal((await store.get('nuova-lezione')).pdfUrl, '/api/lectures/nuova-lezione/pdf');
  const response = await fetch(`${url}/api/lectures/nuova-lezione/pdf`);
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  assert.equal(await response.text(), '%PDF-1.4\nfixture\n%%EOF');
});

test('input non valido e tentativi di accesso fuori directory sono rifiutati', async t => {
  const { url, store } = await setup(t);
  await assert.rejects(store.get('../secrets'), { code: 'INVALID_ID' });
  const post = body => fetch(`${url}/api/lectures/demo/actions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post({ action: 'context', slideNumber: 3, transcriptThroughSlide: 4 })).status, 400);
  assert.equal((await post({ action: 'invent', slideNumber: 3 })).status, 400);
  assert.equal((await post({ action: 'context', slideNumber: 3, apiKey: 'wrong' })).status, 400);
  assert.equal((await post([])).status, 400);
  assert.equal((await fetch(`${url}/api/lectures/demo/pdf`)).status, 404);
  assert.equal((await fetch(`${url}/api/health`, { headers: { Origin: 'https://untrusted.example' } })).status, 403);
});

test('le richieste contemporanee non avviano più generazioni', async t => {
  let resolve, started;
  const began = new Promise(r => { started = r; });
  const pending = new Promise(r => { resolve = r; });
  const { url } = await setup(t, async () => { started(); return pending; });
  const options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'context', slideNumber: 3 }) };
  const first = fetch(`${url}/api/lectures/demo/actions`, options);
  await began;
  const second = await fetch(`${url}/api/lectures/demo/actions`, options);
  assert.equal(second.status, 429);
  resolve(JSON.stringify({ status: 'insufficient_context', summary: 'Manca contesto.', points: [], terms: [], missingContext: ['Definizione'] }));
  assert.equal((await first).status, 200);
});
