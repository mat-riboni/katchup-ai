import test from 'node:test';
import assert from 'node:assert/strict';
import { createLectureController } from '../web/controller.mjs';

const lesson = id => ({ id, slides: [{ number: 1 }, { number: 2 }, { number: 3 }] });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('navigare non genera testo: ogni azione richiede una chiamata esplicita', async () => {
  let calls = 0;
  const controller = createLectureController({ getLecture: async () => lesson('demo'), runAction: async () => { calls++; return { summary: 'ok' }; } });
  await controller.load('demo');
  controller.selectSlide(2);
  assert.equal(calls, 0);
  await controller.run('glossary');
  assert.equal(calls, 1);
  assert.equal(controller.getState().panels.glossary.summary, 'ok');
  assert.equal(controller.getState().panels.context, null);
});

test('una risposta arrivata tardi non appare sulla slide sbagliata', async () => {
  const pending = deferred();
  const controller = createLectureController({ getLecture: async () => lesson('demo'), runAction: () => pending.promise });
  await controller.load('demo');
  const job = controller.run('context');
  controller.selectSlide(2);
  pending.resolve({ summary: 'slide 1' });
  await job;
  assert.equal(controller.getState().panels.context, null);
  assert.equal(controller.getState().pendingAction, null);
});

test('click duplicati non causano chiamate duplicate', async () => {
  const pending = deferred(); let calls = 0;
  const controller = createLectureController({ getLecture: async () => lesson('demo'), runAction: () => { calls++; return pending.promise; } });
  await controller.load('demo');
  const job = controller.run('context');
  await controller.run('context');
  assert.equal(calls, 1);
  pending.resolve({}); await job;
});

test('cambiare disponibilità del transcript invalida i pannelli e aggiorna il cutoff', async () => {
  const requests = [];
  const controller = createLectureController({ getLecture: async () => lesson('demo'), runAction: async (_, body) => { requests.push(body); return {}; } });
  await controller.load('demo'); controller.selectSlide(2);
  await controller.run('explain');
  assert.equal(requests[0].transcriptThroughSlide, 1);
  controller.setCurrentTranscriptAvailable(true);
  assert.equal(controller.getState().panels.explain, null);
  await controller.run('explain');
  assert.equal(requests[1].transcriptThroughSlide, 2);
});

test('caricamenti fuori ordine non sostituiscono la lezione più recente', async () => {
  const old = deferred();
  const controller = createLectureController({ getLecture: id => id === 'old' ? old.promise : Promise.resolve(lesson(id)) });
  const job = controller.load('old');
  await controller.load('new');
  old.resolve(lesson('old')); await job;
  assert.equal(controller.getState().lecture.id, 'new');
});
