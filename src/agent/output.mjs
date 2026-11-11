export const answerSchema = {
  type: 'object', additionalProperties: false,
  required: ['status', 'summary', 'points', 'terms', 'missingContext'],
  properties: {
    status: { type: 'string', enum: ['ok', 'insufficient_context'] },
    summary: { type: 'string' },
    points: { type: 'array', maxItems: 5, items: {
      type: 'object', additionalProperties: false, required: ['text', 'sourceIds'],
      properties: { text: { type: 'string' }, sourceIds: { type: 'array', minItems: 1, items: { type: 'string' } } },
    } },
    terms: { type: 'array', maxItems: 8, items: {
      type: 'object', additionalProperties: false, required: ['term', 'definition', 'sourceIds'],
      properties: { term: { type: 'string' }, definition: { type: 'string' }, sourceIds: { type: 'array', minItems: 1, items: { type: 'string' } } },
    } },
    missingContext: { type: 'array', maxItems: 5, items: { type: 'string' } },
  },
};

// I vincoli devono essere presenti anche nello schema inviato al modello,
// non soltanto nella validazione successiva alla generazione.
export function schemaForAction(action, context) {
  const schema = structuredClone(answerSchema);
  const properties = schema.properties;
  properties.points.maxItems = action === 'glossary' ? 0 : action === 'context' ? 3 : 5;
  properties.terms.maxItems = action === 'glossary' ? 8 : 0;
  for (const field of ['points', 'terms']) {
    const refs = properties[field].items.properties.sourceIds;
    refs.maxItems = 12;
    refs.items.enum = context.sources.map(source => source.id);
  }
  return schema;
}

const nonempty = (v, max = 1800) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const keysMatch = (v, keys) => v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).length === keys.length && keys.every(key => Object.hasOwn(v, key));
const normalize = value => value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ');

export function parseAnswer(raw, context, action) {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const answer = JSON.parse(cleaned);
  const fail = () => { throw new Error('The answer does not match the schema, available sources or requested action.'); };
  if (!keysMatch(answer, ['status', 'summary', 'points', 'terms', 'missingContext'])
    || !['ok', 'insufficient_context'].includes(answer.status) || !nonempty(answer.summary)
    || !Array.isArray(answer.points) || answer.points.length > 5
    || !Array.isArray(answer.terms) || answer.terms.length > 8
    || !Array.isArray(answer.missingContext) || answer.missingContext.length > 5
    || !answer.missingContext.every(v => nonempty(v))) fail();
  const allowed = new Set(context.sources.map(s => s.id));
  const validRefs = refs => Array.isArray(refs) && refs.length > 0 && refs.length <= 12 && refs.every(id => allowed.has(id));
  for (const point of answer.points) {
    if (!keysMatch(point, ['text', 'sourceIds']) || !nonempty(point.text) || !validRefs(point.sourceIds)) fail();
  }
  const currentText = normalize(context.sources.find(s => s.id === `slide:${context.currentSlide}`).text);
  const seen = new Set();
  for (const term of answer.terms) {
    if (!keysMatch(term, ['term', 'definition', 'sourceIds']) || !nonempty(term.term, 120)
      || !nonempty(term.definition) || !validRefs(term.sourceIds)
      || !currentText.includes(normalize(term.term)) || seen.has(normalize(term.term))) fail();
    seen.add(normalize(term.term));
  }
  if (action === 'glossary' && answer.points.length !== 0) throw new Error('For glossary, points must be an empty array [].');
  if (action !== 'glossary' && answer.terms.length !== 0) throw new Error('For context and explain, terms must be an empty array [].');
  if (action === 'context' && answer.points.length > 3) throw new Error('Context allows at most 3 points.');
  if (answer.status === 'ok' && (action === 'glossary' ? !answer.terms.length : !answer.points.length)) fail();
  if (answer.status === 'insufficient_context' && !answer.missingContext.length) fail();
  return answer;
}
