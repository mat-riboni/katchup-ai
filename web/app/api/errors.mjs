// Error codes the UI understands. Raw provider or server messages are never shown:
// every failure is mapped to one of these codes and an English, user-facing message.

export const MESSAGES = {
  MISSING_KEY: 'Choose an AI provider and add its key in Settings to get live answers.',
  INVALID_KEY: 'The provider rejected this API key. Check it in Settings.',
  MODEL_NOT_FOUND: 'The model was not found. Check the model name in Settings (for Ollama, run "ollama pull <model>").',
  OLLAMA_UNREACHABLE: 'Ollama cannot be reached. Start it with "ollama serve" and check the address in Settings.',
  OLLAMA_FORBIDDEN: 'Ollama refused this page. Restart it with OLLAMA_ORIGINS=http://localhost:5173.',
  RATE_LIMIT: 'Too many requests right now. Wait a moment, then retry.',
  BUSY: 'The lesson server is already answering another request. Retry in a moment.',
  OVERLOADED: 'Claude is overloaded right now. Retry in a moment.',
  NETWORK: 'Network error. Check your connection, then retry.',
  OFFLINE: 'You are offline. Slides and glossary still work; live answers resume when you are back online.',
  BACKEND_UNREACHABLE: 'The lesson server cannot be reached. Is it running on port 3001?',
  SERVER_NOT_CONFIGURED: 'The lesson server has no AI provider configured.',
  SERVER_AI_UNREACHABLE: 'The lesson server cannot reach its AI provider. If it uses Ollama, start it with "ollama serve".',
  TIMEOUT: 'The model took too long to answer. Retry.',
  CONTEXT_TOO_LARGE: 'This lesson is too long for a single request.',
  REFUSED: 'Claude declined to answer this request.',
  BAD_RESPONSE: 'The answer could not be read. Retry.',
  REQUEST_REJECTED: 'The request was rejected. Retry, or check the lesson content.',
  ABORTED: 'Stopped.',
  UNKNOWN: 'Something went wrong. Retry.',
};

const RETRYABLE = new Set(['SERVER_AI_UNREACHABLE', 'OLLAMA_UNREACHABLE', 'RATE_LIMIT', 'BUSY', 'OVERLOADED', 'NETWORK', 'OFFLINE', 'BACKEND_UNREACHABLE', 'TIMEOUT', 'BAD_RESPONSE', 'UNKNOWN']);

export class LessonError extends Error {
  constructor(code, { partialText = '' } = {}) {
    super(MESSAGES[code] || MESSAGES.UNKNOWN);
    this.name = 'LessonError';
    this.code = MESSAGES[code] ? code : 'UNKNOWN';
    this.retryable = RETRYABLE.has(this.code);
    this.partialText = partialText;
  }
}

export const isAbort = error => error?.name === 'AbortError' || error?.code === 'ABORTED';

/** Maps an HTTP status from the Claude API to an error code. */
export function claudeStatusToCode(status) {
  if (status === 401 || status === 403) return 'INVALID_KEY';
  if (status === 429) return 'RATE_LIMIT';
  if (status === 529 || status === 503) return 'OVERLOADED';
  if (status === 408 || status === 504) return 'TIMEOUT';
  if (status === 413) return 'CONTEXT_TOO_LARGE';
  if (status >= 400 && status < 500) return 'REQUEST_REJECTED';
  return 'UNKNOWN';
}

/** Maps a Claude streaming `error` event type to an error code. */
export function claudeErrorTypeToCode(type) {
  return ({
    authentication_error: 'INVALID_KEY', permission_error: 'INVALID_KEY',
    rate_limit_error: 'RATE_LIMIT', overloaded_error: 'OVERLOADED',
    request_too_large: 'CONTEXT_TOO_LARGE', invalid_request_error: 'REQUEST_REJECTED',
    timeout_error: 'TIMEOUT',
  })[type] || 'UNKNOWN';
}

/** Maps the existing backend's `{ error: { code } }` to an error code. */
export function backendCodeToCode(code, status) {
  const map = {
    AGENT_BUSY: 'BUSY', LLM_NOT_CONFIGURED: 'SERVER_NOT_CONFIGURED', LLM_TIMEOUT: 'TIMEOUT',
    LLM_UNREACHABLE: 'SERVER_AI_UNREACHABLE', CONTEXT_TOO_LARGE: 'CONTEXT_TOO_LARGE',
    LLM_HTTP_ERROR: 'UNKNOWN', LLM_INVALID_ENVELOPE: 'BAD_RESPONSE', INVALID_LLM_OUTPUT: 'BAD_RESPONSE',
    ORIGIN_NOT_ALLOWED: 'BACKEND_UNREACHABLE',
  };
  if (map[code]) return map[code];
  if (status === 429) return 'BUSY';
  if (status >= 400 && status < 500) return 'REQUEST_REJECTED';
  return 'UNKNOWN';
}
