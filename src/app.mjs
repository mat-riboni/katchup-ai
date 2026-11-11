import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AppError } from './errors.mjs';

async function readJson(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new AppError(415, 'JSON_REQUIRED', 'Usa Content-Type: application/json');
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 4096) throw new AppError(413, 'BODY_TOO_LARGE', 'Richiesta troppo grande');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new AppError(400, 'INVALID_JSON', 'Oggetto JSON non valido'); }
}

export function createApp({ store, agent, config }) {
  // Una generazione alla volta basta per la demo; impedisce doppie richieste accidentali.
  let generating = false;
  return createServer(async (request, response) => {
    const json = (status, body) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(body));
    };
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    try {
      const origin = request.headers.origin;
      const localOrigin = `http://localhost:${config.port}`;
      const loopbackOrigin = `http://127.0.0.1:${config.port}`;
      if (origin && ![config.webOrigin, localOrigin, loopbackOrigin].includes(origin)) {
        throw new AppError(403, 'ORIGIN_NOT_ALLOWED', 'Origine web non ammessa');
      }
      if (origin) {
        response.setHeader('Access-Control-Allow-Origin', origin);
        response.setHeader('Vary', 'Origin');
      }
      if (request.method === 'OPTIONS') {
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        response.writeHead(204); response.end(); return;
      }
      const path = new URL(request.url, 'http://localhost').pathname;
      if (request.method === 'GET' && path === '/api/health') {
        json(200, { status: 'ok', provider: config.provider,
          configured: Boolean(config.model && (config.provider === 'ollama' || config.apiKey)) }); return;
      }
      if (request.method === 'GET' && path === '/api/lectures') { json(200, await store.list()); return; }
      const match = path.match(/^\/api\/lectures\/([a-z0-9-]+)(?:\/(pdf|actions))?$/);
      if (!match) throw new AppError(404, 'NOT_FOUND', 'Endpoint non trovato');
      const [, id, resource] = match;
      if (request.method === 'GET' && !resource) { json(200, await store.get(id)); return; }
      if (request.method === 'GET' && resource === 'pdf') {
        const lecture = await store.get(id);
        if (!lecture.pdfUrl) throw new AppError(404, 'PDF_NOT_FOUND', 'Questa lezione non ha ancora un PDF');
        const pdf = await readFile(join(await store.directory(id), 'slides.pdf'));
        response.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': pdf.length,
          'Content-Disposition': 'inline; filename="slides.pdf"' });
        response.end(pdf); return;
      }
      if (request.method === 'POST' && resource === 'actions') {
        const body = await readJson(request);
        if (Object.keys(body).some(key => !['action', 'slideNumber', 'transcriptThroughSlide'].includes(key))) {
          throw new AppError(400, 'INVALID_REQUEST', 'Campi della richiesta non riconosciuti');
        }
        const lecture = await store.get(id);
        if (generating) throw new AppError(429, 'AGENT_BUSY', 'Una risposta è già in generazione. Riprova al termine.');
        generating = true;
        try { json(200, await agent.run({ lecture, ...body })); }
        finally { generating = false; }
        return;
      }
      throw new AppError(405, 'METHOD_NOT_ALLOWED', 'Metodo non supportato');
    } catch (error) {
      json(error instanceof AppError ? error.status : 500, {
        error: { code: error instanceof AppError ? error.code : 'INTERNAL_ERROR',
          message: error instanceof AppError ? error.message : 'Errore interno del server' },
      });
    }
  });
}
