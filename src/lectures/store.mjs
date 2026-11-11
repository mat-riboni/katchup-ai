import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { AppError } from '../errors.mjs';
import { isId, validateLecture } from './schema.mjs';

export class LectureStore {
  constructor(dataDir, exampleDir) { this.dataDir = dataDir; this.exampleDir = exampleDir; }

  async directory(id) {
    if (!isId(id)) throw new AppError(400, 'INVALID_ID', 'Identificativo lezione non valido');
    return join(id === 'demo' ? this.exampleDir : this.dataDir, id);
  }

  async get(id) {
    const directory = await this.directory(id);
    let raw;
    try { raw = await readFile(join(directory, 'lecture.json'), 'utf8'); }
    catch (error) {
      if (error.code === 'ENOENT') throw new AppError(404, 'NOT_FOUND', 'Lezione non trovata');
      throw error;
    }
    const lecture = validateLecture(JSON.parse(raw));
    if (lecture.id !== id) throw new Error('Identificativo incoerente nel manifest');
    let hasPdf = false;
    try { hasPdf = (await stat(join(directory, 'slides.pdf'))).isFile(); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    return {
      ...lecture,
      pdfUrl: hasPdf ? `/api/lectures/${id}/pdf` : null,
      slides: lecture.slides.map(slide => ({ ...slide, pdfPage: slide.number })),
    };
  }

  async list() {
    const dirs = await readdir(this.dataDir, { withFileTypes: true });
    const ids = ['demo', ...dirs.filter(d => d.isDirectory() && isId(d.name) && d.name !== 'demo').map(d => d.name)];
    const lectures = await Promise.all(ids.map(id => this.get(id)));
    return lectures.map(({ id, title, slides, pdfUrl }) => ({ id, title, slideCount: slides.length, pdfUrl }));
  }
}
