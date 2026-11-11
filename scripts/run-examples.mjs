import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { parseLessonJson } from '../web/app/lesson/load.mjs';
import { createLessonApi } from '../web/app/api/lesson.mjs';
import { LectureAgent } from '../src/agent/agent.mjs';

const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const lesson = parseLessonJson(await readJson('../web/lesson/lesson.json'));
const lecture = await readJson('../examples/agent-check/lecture.json');
const api = createLessonApi({ revealDelay: 0, fetchImpl: () => assert.fail('These examples must work offline.') });
const results = [];

for (const [id, persona, intent, slideNumber, action] of [
  ['lost-context', 'Student who lost the thread', 'What do I need to remember to understand this Bellman equation?', 25, 'context'],
  ['notation', 'Student new to reinforcement learning', 'What do G_t and gamma mean on this slide?', 17, 'glossary'],
  ['check-calculation', 'Student checking a worked example', 'Why does the Pub action show 8.4?', 46, 'explain'],
  ['uncertainty', 'Student studying partial observability', 'How should I interpret a belief such as [0.7, 0.3]?', 58, 'explain'],
]) {
  const request = { slideNumber, action };
  const response = action === 'glossary'
    ? { ...await api.refineGlossary({ lesson, slideNumber }), symbols: lesson.slides[slideNumber - 1].symbols }
    : await api.streamAnswer({ lesson, slideNumber, action });
  results.push({ id, persona, intent, mode: 'prepared UI action', request, response });
}
assert.match(results[0].response.text, /remaining tail/);
assert.ok(results[1].response.symbols.some(s => s.symbol === 'γ'));
assert.match(results[2].response.text, /9\.4/);
assert.match(results[3].response.text, /70% and 30%/);

// Use fixed adapter output to exercise the real agent's validation without a model or API key.
const validAnswer = {
  status: 'ok', summary: 'Distinguish a one-step reward from a return.',
  points: [{ text: 'A reward is numerical feedback from one step, not the entire future of a trajectory.', sourceIds: ['transcript:1'] }],
  terms: [], missingContext: [],
};
const grounded = new LectureAgent({ async complete({ system, user }) {
  assert.match(system, /Write in clear English/);
  const context = JSON.parse(user);
  assert.ok(context.sources.every(source => source.slideNumber <= 2));
  assert.ok(!context.sources.some(source => source.id === 'transcript:2'));
  return JSON.stringify(validAnswer);
} });
results.push({ id: 'grounded-agent', persona: 'Student reviewing prerequisites',
  intent: 'Connect the previous explanation to the current slide.', mode: 'real agent with fixed adapter output',
  request: { slideNumber: 2, action: 'context' },
  response: await grounded.run({ lecture, slideNumber: 2, action: 'context' }) });

let calls = 0;
const boundary = new LectureAgent({ async complete() { calls++; throw new Error('The scope check must run first.'); } });
const boundaryRequest = { slideNumber: 2, action: 'explain', transcriptThroughSlide: 3 };
await assert.rejects(boundary.run({ lecture, ...boundaryRequest }), error => {
  assert.equal(error.code, 'INVALID_CUTOFF');
  results.push({ id: 'future-transcript-boundary', persona: 'Student requesting future material',
    intent: 'Use the transcript from slide 3 even though the selected slide is 2.', mode: 'real agent input guard',
    request: boundaryRequest, response: { error: { code: error.code, message: error.message }, httpStatus: error.status, modelCalls: calls } });
  return true;
});
assert.equal(calls, 0);

let invalidCalls = 0;
const invalid = new LectureAgent({ async complete() {
  invalidCalls++;
  return JSON.stringify({ ...validAnswer, points: [{ text: 'Value is expected return.', sourceIds: ['transcript:3'] }] });
} });
await assert.rejects(invalid.run({ lecture, slideNumber: 2, action: 'context' }), error => {
  assert.equal(error.code, 'INVALID_LLM_OUTPUT');
  results.push({ id: 'future-citation-boundary', persona: 'Student relying on source-grounded answers',
    intent: 'Receive only an answer supported by the available lecture sources.', mode: 'real validator with invalid adapter fixture',
    request: { slideNumber: 2, action: 'context' },
    response: { error: { code: error.code, message: error.message }, httpStatus: error.status, adapterCalls: invalidCalls } });
  return true;
});
assert.equal(invalidCalls, 2);

const report = { formatVersion: 1, externalModelCalls: 0, examples: results };
const json = JSON.stringify(report, null, 2) + '\n';
if (process.argv.includes('--write')) await writeFile(new URL('../examples/submission-results.json', import.meta.url), json);
if (process.argv.includes('--json')) process.stdout.write(json);
else {
  for (const example of results) console.log(`PASS ${example.id}: ${example.response.error?.code || example.response.status || 'prepared content returned'}`);
  console.log(`${results.length} scenarios passed. No external model calls.`);
  if (process.argv.includes('--write')) console.log('Saved examples/submission-results.json');
}
