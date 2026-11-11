import { LessonError } from './api/errors.mjs';

export function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new LessonError('ABORTED')); return; }
    const cancel = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      reject(new LessonError('ABORTED'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', cancel);
      resolve();
    }, ms);
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

// Keep mathematical expressions and bold spans whole while revealing prose in small chunks.
export async function revealText(text, onText, signal, { delay = 20 } = {}) {
  if (signal?.aborted) throw new LessonError('ABORTED');
  if (delay <= 0) { onText(text); return; }
  const tokens = text.match(/(?:`[^`]*`|\*\*[^*]+\*\*|[^\s`*]+|[`*])\s*|\s+/g) || [];
  let shown = '';
  for (const token of tokens) {
    if (shown) await pause(delay, signal);
    if (signal?.aborted) throw new LessonError('ABORTED');
    shown += token;
    onText(shown);
  }
  if (signal?.aborted) throw new LessonError('ABORTED');
}
