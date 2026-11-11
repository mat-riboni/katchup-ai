import { AppError } from '../errors.mjs';

export function buildContext(lecture, slideNumber, transcriptThroughSlide = slideNumber - 1) {
  if (!Number.isInteger(slideNumber) || slideNumber < 1 || slideNumber > lecture.slides.length) {
    throw new AppError(404, 'SLIDE_NOT_FOUND', 'Slide not found.');
  }
  if (!Number.isInteger(transcriptThroughSlide) || transcriptThroughSlide < 0 || transcriptThroughSlide > slideNumber) {
    throw new AppError(400, 'INVALID_CUTOFF', 'The available transcript must stop at or before the selected slide.');
  }
  const sources = [];
  for (const slide of lecture.slides.slice(0, slideNumber)) {
    sources.push({ id: `slide:${slide.number}`, kind: 'slide', slideNumber: slide.number, text: slide.text });
    if (slide.number <= transcriptThroughSlide && slide.transcript.trim()) {
      sources.push({ id: `transcript:${slide.number}`, kind: 'transcript', slideNumber: slide.number, text: slide.transcript });
    }
  }
  const context = { title: lecture.title, currentSlide: slideNumber, transcriptThroughSlide, sources };
  // Fail esplicito: non perdiamo prerequisiti troncando silenziosamente la lezione.
  if (JSON.stringify(context).length > 65000) throw new AppError(413, 'CONTEXT_TOO_LARGE', 'Use a shorter lesson for this prototype (maximum context: 65000 characters).');
  return context;
}
