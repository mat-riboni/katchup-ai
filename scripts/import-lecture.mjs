import { readFile, mkdir, copyFile, writeFile, rename, rm, mkdtemp, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { readConfig } from '../src/config.mjs';
import { validateLecture } from '../src/lectures/schema.mjs';

export async function importLecture(manifestPath, pdfPath, dataDir) {
  const manifestStat = await stat(manifestPath);
  if (manifestStat.size > 3_000_000) throw new Error('Manifest massimo 3 MB');
  const lecture = validateLecture(JSON.parse(await readFile(manifestPath, 'utf8')));
  if (lecture.id === 'demo') throw new Error('L’id demo è riservato all’esempio');
  if (pdfPath) {
    const pdfStat = await stat(pdfPath);
    if (pdfStat.size > 25_000_000) throw new Error('PDF massimo 25 MB');
    const pdf = await readFile(pdfPath);
    if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Il file non ha una firma PDF valida');
  }
  await mkdir(dataDir, { recursive: true });
  const target = join(dataDir, lecture.id);
  // Prenota il nome: non sovrascrive mai una lezione esistente.
  await mkdir(target);
  let staging;
  try {
    staging = await mkdtemp(join(dataDir, '.import-'));
    await writeFile(join(staging, 'lecture.json'), JSON.stringify(lecture, null, 2) + '\n');
    if (pdfPath) await copyFile(pdfPath, join(staging, 'slides.pdf'));
    await rename(staging, target);
  } catch (error) {
    await rm(target, { recursive: true, force: true });
    throw error;
  } finally { if (staging) await rm(staging, { recursive: true, force: true }); }
  return lecture.id;
}

import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , manifest, pdf] = process.argv;
  if (!manifest) {
    console.error('Uso: npm run import:lecture -- percorso/lecture.json [percorso/slides.pdf]');
    process.exitCode = 1;
  } else {
    try { console.log(`Lezione importata: ${await importLecture(manifest, pdf, readConfig().dataDir)}`); }
    catch (error) { console.error(`Importazione fallita: ${error.message}`); process.exitCode = 1; }
  }
}
