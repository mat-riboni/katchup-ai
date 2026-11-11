// Imports Katchup's built-in sample lesson into the backend (data/katchup-sample/), using the
// backend's own import function: no backend code changes. After this, with the AI provider set
// to "Automatic", the frontend recognises the lesson by id and the backend answers for it.
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConfig } from '../src/config.mjs';
import { importLecture } from './import-lecture.mjs';
import { SAMPLE_LESSON } from '../web/app/lesson/sample.mjs';
import { plain } from '../web/app/lesson/model.mjs';

const { dataDir } = readConfig();
const target = join(dataDir, SAMPLE_LESSON.id);

try {
  await stat(target);
  console.log(`Already imported: ${target}`);
} catch {
  // Backend manifest format: what is written on each slide + what the lecturer said.
  const manifest = {
    id: SAMPLE_LESSON.id,
    title: SAMPLE_LESSON.title,
    slides: SAMPLE_LESSON.slides.map(slide => ({
      number: slide.number,
      title: slide.title,
      text: [...slide.bullets.map(plain), slide.formula ? `Formula: ${slide.formula}` : ''].filter(Boolean).join('. '),
      transcript: slide.transcript,
    })),
  };
  const dir = await mkdtemp(join(tmpdir(), 'katchup-'));
  try {
    const file = join(dir, 'lecture.json');
    await writeFile(file, JSON.stringify(manifest, null, 2));
    console.log(`Imported into the backend: ${await importLecture(file, undefined, dataDir)}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
