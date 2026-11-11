import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildContext } from '../src/agent/context.mjs';
import { parseAnswer } from '../src/agent/output.mjs';
import { LectureAgent } from '../src/agent/agent.mjs';

const lecture = JSON.parse(await readFile(new URL('../examples/demo/lecture.json', import.meta.url), 'utf8'));
const contextAnswer = () => ({ status: 'ok', summary: 'Collega costo percorso e stima rimanente.',
  points: [{ text: 'g(n) è il costo già accumulato.', sourceIds: ['transcript:1'] }], terms: [], missingContext: [] });
const glossaryAnswer = () => ({ status: 'ok', summary: 'Simboli della funzione di valutazione.', points: [],
  terms: [{ term: 'g(n)', definition: 'Costo del cammino già percorso.', sourceIds: ['transcript:1'] }], missingContext: [] });

test('il contesto esclude slide future e trascrizione corrente per default', () => {
  const context = buildContext(lecture, 3);
  assert.deepEqual(context.sources.map(s => s.id), ['slide:1', 'transcript:1', 'slide:2', 'transcript:2', 'slide:3']);
  assert.ok(!JSON.stringify(context).includes('consistente'));
  assert.ok(!JSON.stringify(context).includes('A stella combina'));
});

test('la trascrizione corrente si include soltanto esplicitamente', () => {
  assert.equal(buildContext(lecture, 3, 3).sources.at(-1).id, 'transcript:3');
  assert.throws(() => buildContext(lecture, 3, 4), { code: 'INVALID_CUTOFF' });
  assert.throws(() => buildContext(lecture, 3, null), { code: 'INVALID_CUTOFF' });
  assert.throws(() => buildContext(lecture, 99), /Slide/);
});

test('prima slide senza alcuna trascrizione disponibile', () => {
  assert.deepEqual(buildContext(lecture, 1).sources.map(s => s.id), ['slide:1']);
});

test('contesti eccessivi danno errore senza troncamento silenzioso', () => {
  const huge = structuredClone(lecture);
  huge.slides[0].text = 'x'.repeat(66000);
  assert.throws(() => buildContext(huge, 1), /65000/);
});

test('il glossario rifiuta termini esterni alla slide e citazioni future', () => {
  const context = buildContext(lecture, 3);
  assert.equal(parseAnswer(JSON.stringify(glossaryAnswer()), context, 'glossary').terms[0].term, 'g(n)');
  const wrongTerm = glossaryAnswer(); wrongTerm.terms[0].term = 'Consistenza';
  assert.throws(() => parseAnswer(JSON.stringify(wrongTerm), context, 'glossary'));
  const wrongSource = glossaryAnswer(); wrongSource.terms[0].sourceIds = ['transcript:4'];
  assert.throws(() => parseAnswer(JSON.stringify(wrongSource), context, 'glossary'));
  const duplicate = glossaryAnswer(); duplicate.terms.push({ ...duplicate.terms[0] });
  assert.throws(() => parseAnswer(JSON.stringify(duplicate), context, 'glossary'));
});

test('il modello riceve fonti disponibili e restituisce riferimenti risolvibili', async () => {
  const calls = [];
  const agent = new LectureAgent({ async complete(input) { calls.push(input); return JSON.stringify(contextAnswer()); } });
  const answer = await agent.run({ lecture, slideNumber: 3, action: 'context' });
  assert.equal(calls.length, 1);
  assert.equal(answer.sources[0].text, lecture.slides[0].transcript);
  assert.equal(answer.transcriptThroughSlide, 2);
  assert.ok(!calls[0].user.includes('Consistenza'));
  assert.ok(calls[0].system.includes('RECOVER THE CONTEXT'));
  assert.ok(calls[0].system.includes('Write in clear English'));
});

test('una risposta malformata causa un solo nuovo tentativo', async () => {
  let calls = 0;
  const agent = new LectureAgent({ async complete() { calls++; return calls === 1 ? 'non JSON' : JSON.stringify(contextAnswer()); } });
  await agent.run({ lecture, slideNumber: 3, action: 'context' });
  assert.equal(calls, 2);
  const bad = new LectureAgent({ async complete() { return '{}'; } });
  await assert.rejects(bad.run({ lecture, slideNumber: 3, action: 'context' }), { code: 'INVALID_LLM_OUTPUT' });
});

test('il recupero del filo non accetta un glossario come risposta', () => {
  assert.throws(() => parseAnswer(JSON.stringify(glossaryAnswer()), buildContext(lecture, 3), 'context'));
});

test('l’agente può segnalare onestamente contesto insufficiente', async () => {
  const answer = { status: 'insufficient_context', summary: 'Manca la definizione.', points: [], terms: [], missingContext: ['Definizione non ancora spiegata'] };
  const agent = new LectureAgent({ async complete() { return JSON.stringify(answer); } });
  assert.equal((await agent.run({ lecture, slideNumber: 1, action: 'context' })).status, 'insufficient_context');
});

test('un errore di rete non provoca una seconda chiamata a pagamento', async () => {
  let calls = 0;
  const agent = new LectureAgent({ async complete() { calls++; throw new Error('rete'); } });
  await assert.rejects(agent.run({ lecture, slideNumber: 3, action: 'context' }), /rete/);
  assert.equal(calls, 1);
});
