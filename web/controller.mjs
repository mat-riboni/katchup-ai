const emptyPanels = () => ({ context: null, explain: null, glossary: null });

// Stato e interazioni pronti per la futura vista. Non produce HTML o CSS.
export function createLectureController(api, onChange = () => {}) {
  let version = 0;
  let loadingVersion = 0;
  let state = { lecture: null, slideNumber: 1, includeCurrentTranscript: false,
    loading: false, pendingAction: null, panels: emptyPanels(), error: null };
  const snapshot = () => structuredClone(state);
  const update = patch => { state = { ...state, ...patch }; onChange(snapshot()); };
  const invalidate = patch => { version++; update({ ...patch, panels: emptyPanels(), error: null }); };
  return {
    getState: snapshot,
    async load(id) {
      const loadToken = ++loadingVersion;
      invalidate({ lecture: null, loading: true, slideNumber: 1, includeCurrentTranscript: false });
      try {
        const lecture = await api.getLecture(id);
        if (loadToken === loadingVersion) update({ lecture, loading: false });
      } catch (error) { if (loadToken === loadingVersion) update({ error: error.message, loading: false }); }
    },
    selectSlide(number) {
      if (!Number.isInteger(number) || number < 1 || number > (state.lecture?.slides.length || 0)) throw new Error('Slide non valida');
      invalidate({ slideNumber: number, includeCurrentTranscript: false });
    },
    setCurrentTranscriptAvailable(available) {
      if (typeof available !== 'boolean') throw new Error('Valore booleano richiesto');
      invalidate({ includeCurrentTranscript: available });
    },
    async run(action) {
      if (!['context', 'explain', 'glossary'].includes(action)) throw new Error('Azione non valida');
      if (!state.lecture || state.pendingAction || state.loading) return;
      const token = version;
      const lectureId = state.lecture.id;
      const slideNumber = state.slideNumber;
      const transcriptThroughSlide = state.includeCurrentTranscript ? slideNumber : slideNumber - 1;
      update({ pendingAction: action, error: null });
      try {
        const result = await api.runAction(lectureId, { action, slideNumber, transcriptThroughSlide });
        if (token === version) update({ panels: { ...state.panels, [action]: result } });
      } catch (error) { if (token === version) update({ error: error.message }); }
      finally { update({ pendingAction: null }); }
    },
  };
}
