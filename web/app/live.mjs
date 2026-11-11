// Live lecture, simulated. In class, the transcript arrives as the professor speaks; here the
// lesson's transcript is played back word by word at speaking pace, and the professor moves to
// the next slide when the words of a slide run out.
//
// To use real live transcription, replace this source with one that emits the same snapshots
// (slide the professor is on + words heard so far), e.g. from a speech-to-text stream.

export const WORDS_PER_MINUTE = 160;

const split = text => String(text || '').split(/\s+/).filter(Boolean);

/**
 * The lesson as the student can know it now: no slide after the live one, and the live slide's
 * transcript only up to the last word heard. Every AI request is built from this.
 */
export function heardLesson(lesson, liveSlide, wordsHeard) {
  const slides = lesson.slides.slice(0, liveSlide).map((slide, i) => {
    if (i < liveSlide - 1) return slide;
    const words = split(slide.transcript);
    return wordsHeard >= words.length ? slide : { ...slide, transcript: words.slice(0, wordsHeard).join(' ') };
  });
  const live = split(lesson.slides[liveSlide - 1]?.transcript);
  return { ...lesson, slides, partialSlide: wordsHeard < live.length ? liveSlide : null };
}

export function createLiveSession(lesson, { startSlide = 1, playing = true, speed = 1, onChange = () => {} } = {}) {
  const words = lesson.slides.map(s => split(s.transcript));
  const total = lesson.slides.length;
  let slide = Math.max(1, Math.min(total, startSlide));
  let word = 0;
  let rate = speed;
  let timer = null;
  let running = false;
  let ended = false;

  const snapshot = () => ({
    slide, word, words: words[slide - 1].length, playing: running, speed: rate, ended,
    recent: words[slide - 1].slice(Math.max(0, word - 22), word).join(' '),
  });
  const emit = (reason = 'tick') => onChange(snapshot(), reason);

  function step() {
    timer = null;
    if (word < words[slide - 1].length) {
      word++;
      emit('word');
    } else if (slide < total) {
      slide++; word = 0;
      emit('slide');
    } else {
      ended = true; running = false;
      emit('ended');
      return;
    }
    if (running) schedule();
  }
  function schedule() {
    const perWord = 60_000 / WORDS_PER_MINUTE / rate;
    // A short pause when the professor finishes a slide, before moving on.
    const delay = word >= words[slide - 1].length ? perWord * 6 : perWord;
    timer = setTimeout(step, delay);
  }

  const session = {
    snapshot,
    play() { if (running || ended) return; running = true; schedule(); emit('play'); },
    pause() { if (!running) return; running = false; clearTimeout(timer); timer = null; emit('pause'); },
    toggle() { return running ? session.pause() : session.play(); },
    setSpeed(value) { rate = value; if (running) { clearTimeout(timer); schedule(); } emit('speed'); },
    destroy() { running = false; clearTimeout(timer); timer = null; },
  };
  if (playing) { running = true; schedule(); }
  return session;
}
