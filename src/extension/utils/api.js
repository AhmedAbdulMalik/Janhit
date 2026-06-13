// c:\Users\iyand\Downloads\Janhit\src\extension\utils\api.js

/**
 * @typedef {{ signal?: AbortSignal }} RequestInitExtras
 */

/**
 * @typedef {{ transcript: string, language: string, confidence?: number }} TranscribeResponse
 */

/**
 * @typedef {{ intent: string | null, confidence: number | null, entities: Record<string, unknown>, nextQuestion: string | null, workflow: string | null }} ProcessResponseData
 */

/**
 * @typedef {{ success: true, data: ProcessResponseData }} ProcessResponse
 */

/**
 * @typedef {{ title: string, workflow: string, description: string, fields: Array<{ name: string, label: string, type: string, value: string }>, draft: string }} GenerateFormResponse
 */

/**
 * @typedef {{ audio_url: string, language: string }} SynthesizeResponse
 */

export class JanhitAPI {
  /**
   * @param {string | null} baseUrl
   */
  constructor(baseUrl = null) {
    this.baseUrl = baseUrl || 'https://janhit.example.com';
    this.timeoutMs = 45000;
  }

  /**
   * @param {Blob} audioBlob
   * @param {string} language
   * @param {RequestInitExtras} [options]
   * @returns {Promise<TranscribeResponse>}
   */
  async transcribeAudio(audioBlob, language = 'hi-IN', options = {}) {
    const formData = new FormData();
    formData.append('audio', audioBlob, `voice-${Date.now()}.webm`);
    formData.append('language', language);

    return this.post('/api/transcribe', formData, options);
  }

  /**
   * @param {string} transcript
   * @param {Record<string, unknown>} context
   * @param {RequestInitExtras} [options]
   * @returns {Promise<ProcessResponse>}
   */
  async processTranscript(transcript, context = {}, options = {}) {
    return this.post('/api/process', {
      transcript,
      context,
      timestamp: new Date().toISOString(),
    }, options);
  }

  /**
   * @param {string} intent
   * @param {Record<string, unknown>} collectedData
   * @param {RequestInitExtras} [options]
   * @returns {Promise<GenerateFormResponse>}
   */
  async generateFormDraft(intent, collectedData = {}, options = {}) {
    return this.post('/api/generate-form', {
      intent,
      data: collectedData,
    }, options);
  }

  /**
   * @param {string} text
   * @param {string} language
   * @param {RequestInitExtras} [options]
   * @returns {Promise<SynthesizeResponse>}
   */
  async synthesizeSpeech(text, language = 'hi-IN', options = {}) {
    return this.post('/api/synthesize', {
      text,
      language,
    }, options);
  }

  /**
   * @template T
   * @param {string} endpoint
   * @param {unknown} data
   * @param {RequestInitExtras} [options]
   * @returns {Promise<T>}
   */
  async post(endpoint, data, options = {}) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: data instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
      body: data instanceof FormData ? data : JSON.stringify(data),
      signal: options.signal || AbortSignal.timeout(this.timeoutMs),
    });

    const payload = await readJsonResponse(response);

    if (!response.ok) {
      throw new Error(getErrorMessage(payload, `API error: ${response.status} ${response.statusText}`));
    }

    return /** @type {T} */ (payload);
  }

  /**
   * @template T
   * @param {string} endpoint
   * @returns {Promise<T>}
   */
  async get(endpoint) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'GET',
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    const payload = await readJsonResponse(response);

    if (!response.ok) {
      throw new Error(getErrorMessage(payload, `API error: ${response.status} ${response.statusText}`));
    }

    return /** @type {T} */ (payload);
  }
}

/**
 * @param {Response} response
 * @returns {Promise<unknown>}
 */
async function readJsonResponse(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

/**
 * @param {unknown} payload
 * @param {string} fallback
 * @returns {string}
 */
function getErrorMessage(payload, fallback) {
  if (payload && typeof payload === 'object') {
    const candidate = /** @type {{ message?: unknown, error?: unknown }} */ (payload);

    if (typeof candidate.message === 'string' && candidate.message.trim()) {
      return candidate.message;
    }

    if (typeof candidate.error === 'string' && candidate.error.trim()) {
      return candidate.error;
    }
  }

  return fallback;
}