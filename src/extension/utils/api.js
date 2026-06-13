// c:\Users\iyand\Downloads\Janhit\src\extension\utils\api.js

/**
 * Typed API utility module for Janhit extension.
 * Handles communication with the Cloudflare Worker backend.
 */

/**
 * @typedef {{
 *   signal?: AbortSignal
 * }} RequestInitExtras
 */

/**
 * @typedef {{
 *   transcript: string,
 *   language: string,
 *   confidence?: number
 * }} TranscribeResponse
 */

/**
 * @typedef {{
 *   intent: string | null,
 *   confidence: number | null,
 *   entities: Record<string, unknown>,
 *   nextQuestion: string | null,
 *   workflow: string | null
 * }} ProcessResponseData
 */

/**
 * @typedef {{
 *   data: ProcessResponseData
 * }} ProcessResponse
 */

/**
 * @typedef {{
 *   title: string,
 *   fields: Array<{ name: string, label: string, type: string, options?: string[] }>,
 *   draft: string
 * }} GeneratedForm
 */

/**
 * @typedef {{
 *   form: GeneratedForm
 * }} GenerateFormResponse
 */

/**
 * @typedef {{
 *   audio_url: string,
 *   audio_mime_type?: string,
 *   language: string
 * }} SynthesizeResponse
 *
 * @typedef {{
 *   language: string,
 *   intent: string | null,
 *   workflow: string | null,
 *   confidence: number | null,
 *   responseText: string,
 *   audio_url: string,
 *   audio_mime_type?: string,
 *   data?: ProcessResponseData,
 *   form?: GeneratedForm
 * }} VoiceAssistResponse
 */

class JanhitAPI {
  /**
   * @param {string | null} baseUrl
   */
  constructor(baseUrl = null) {
    this.baseUrl = baseUrl || 'https://janhit.example.com';
    this.timeout = 45000;
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
   * @param {Blob} audioBlob
   * @param {string} language
   * @param {Record<string, unknown>} context
   * @param {RequestInitExtras} [options]
   * @returns {Promise<VoiceAssistResponse>}
   */
  async voiceAssist(audioBlob, language = 'hi-IN', context = {}, options = {}) {
    const formData = new FormData();
    formData.append('audio', audioBlob, `voice-${Date.now()}.webm`);
    formData.append('language', language);
    formData.append('context', JSON.stringify(context));

    return this.post('/api/voice-assist', formData, options);
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
    try {
      const headers = {
        'Content-Type': data instanceof FormData ? undefined : 'application/json',
      };

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: Object.fromEntries(Object.entries(headers).filter(([, value]) => value !== undefined)),
        body: data instanceof FormData ? data : JSON.stringify(data),
        signal: options.signal,
      });

      const responseText = await response.text();
      const payload = responseText ? parseJsonSafely(responseText) : {};

      if (!response.ok) {
        throw new Error(getErrorMessage(payload, `API error: ${response.status} ${response.statusText}`));
      }

      return /** @type {T} */ (payload);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }

      console.error(`Error calling ${endpoint}:`, error);
      throw error;
    }
  }

  /**
   * @template T
   * @param {string} endpoint
   * @returns {Promise<T>}
   */
  async get(endpoint) {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'GET',
        signal: AbortSignal.timeout(this.timeout),
      });

      const responseText = await response.text();
      const payload = responseText ? parseJsonSafely(responseText) : {};

      if (!response.ok) {
        throw new Error(getErrorMessage(payload, `API error: ${response.status} ${response.statusText}`));
      }

      return /** @type {T} */ (payload);
    } catch (error) {
      console.error(`Error calling ${endpoint}:`, error);
      throw error;
    }
  }
}

/**
 * @param {string} text
 * @returns {unknown}
 */
function parseJsonSafely(text) {
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
    const message = typeof candidate.message === 'string' && candidate.message.trim()
      ? candidate.message
      : typeof candidate.error === 'string' && candidate.error.trim()
        ? candidate.error
        : '';

    return message || fallback;
  }

  return fallback;
}

/** @type {{ JanhitAPI: typeof JanhitAPI }} */
const exportsObject = { JanhitAPI };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exportsObject;
}
