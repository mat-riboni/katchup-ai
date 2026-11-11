import { AppError } from '../errors.mjs';

export const isId = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;

export function validateLecture(value) {
  const fail = message => { throw new AppError(400, 'INVALID_LECTURE', message); };
  if (!value || !isId(value.id) || !text(value.title, 200)) fail('id o titolo lezione non validi');
  if (!Array.isArray(value.slides) || value.slides.length < 1 || value.slides.length > 150) fail('Servono da 1 a 150 slide');
  const slides = value.slides.map((slide, index) => {
    if (!slide || slide.number !== index + 1 || !text(slide.title, 200) || !text(slide.text, 15000)) {
      fail('Le slide devono avere numero consecutivo da 1, titolo e testo (max 15000 caratteri)');
    }
    if (typeof slide.transcript !== 'string' || slide.transcript.length > 30000) fail('Transcript mancante o troppo lungo');
    return { number: slide.number, title: slide.title, text: slide.text, transcript: slide.transcript };
  });
  return { id: value.id, title: value.title, slides };
}
