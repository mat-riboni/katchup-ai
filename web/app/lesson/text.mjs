// Small text utilities: tokenizing, sentences, stop words. English only.

export const STOP_WORDS = new Set(`a about above after again against all also am an and any are as at be because been before
being below between both but by can could did do does doing down during each either else even every few for from further
had has have having he her here hers herself him himself his how i if in into is it its itself just let like may me might
more most much must my myself no nor not now of off on once one only or other our ours ourselves out over own per same
she should since so some such than that the their theirs them themselves then there these they this those through thus to
too under until up upon us very was we were what when where which while who whom why will with within without would yet
you your yours yourself yourselves new used use uses using way ways get gets got make makes made see seen say said says
well really quite thing things lot first second next last today now here there point points slide slides lecture
want wants need needs good bad called call calls give gives given take takes never always often usually simply
still already ever rather instead example examples case cases part parts kind look looks means mean`.split(/\s+/));

const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

export const words = text => (String(text).match(WORD) || []).map(w => w.toLowerCase().replace(/['’]s$/, ''));

/** Light stemming so that "gradients" matches "gradient". */
export const stem = word => word.length > 4 ? word.replace(/(ies|es|s)$/, m => (m === 'ies' ? 'y' : '')) : word;

export const contentTokens = text => words(text).filter(w => !STOP_WORDS.has(w) && w.length > 2 && !/^\d+$/.test(w)).map(stem);

export function sentences(text) {
  return String(text).replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z0-9“"(])/).map(s => s.trim()).filter(Boolean);
}

export const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
