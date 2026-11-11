// Client indipendente da React/Vue: nessuna chiave API arriva nel browser.
export function createApi(baseUrl = 'http://127.0.0.1:3001', fetchImpl = fetch) {
  async function request(path, options) {
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}${path}`, options);
    const body = await response.json();
    if (!response.ok) {
      const error = new Error(body.error?.message || 'Richiesta fallita');
      error.code = body.error?.code;
      throw error;
    }
    return body;
  }
  return {
    listLectures: () => request('/api/lectures'),
    getLecture: id => request(`/api/lectures/${encodeURIComponent(id)}`),
    runAction: (id, payload) => request(`/api/lectures/${encodeURIComponent(id)}/actions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    }),
    pdfUrl: (lecture, page) => lecture.pdfUrl ? `${baseUrl.replace(/\/$/, '')}${lecture.pdfUrl}#page=${page}` : null,
  };
}
