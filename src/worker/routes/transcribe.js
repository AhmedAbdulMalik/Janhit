// c:\Users\iyand\Downloads\Janhit\src\worker\routes\transcribe.js

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, api-key',
};

/**
 * @typedef {{
 *   transcript: string,
 *   language: string,
 *   confidence?: number
 * }} TranscribeSuccessResponse
 */

/**
 * @typedef {{
 *   SARVAM_API_KEY?: string,
 *   SARVAM_STT_URL?: string
 * }} EnvBindings
 */

/**
 * @param {Request} request
 * @param {EnvBindings} env
 * @returns {Promise<Response>}
 */
export async function handleTranscribe(request, env) {
  try {
    const apiKey = normalizeString(env.SARVAM_API_KEY);

    if (!apiKey) {
      return jsonResponse(
        {
          success: false,
          error: 'Transcription unavailable',
          message: 'SARVAM_API_KEY is not configured',
        },
        500
      );
    }

    const formData = await request.formData();
    const audio = formData.get('audio');
    const language = normalizeString(formData.get('language')) || 'en';

    if (!(audio instanceof Blob)) {
      return jsonResponse(
        {
          success: false,
          error: 'Bad request',
          message: 'Missing audio upload',
        },
        400
      );
    }

    const upstreamBody = new FormData();
    upstreamBody.append('file', audio, getUploadName(audio));
    upstreamBody.append('model', 'saaras:v3');
    upstreamBody.append('mode', 'translate');
    upstreamBody.append('language', language);

    const upstreamResponse = await fetch(resolveSarvamTranscribeUrl(env), {
      method: 'POST',
      headers: {
        'api-key': apiKey,
      },
      body: upstreamBody,
    });

    const upstreamText = await upstreamResponse.text();
    const upstreamPayload = upstreamText ? safeParseJson(upstreamText) : null;

    if (!upstreamResponse.ok) {
      return jsonResponse(
        {
          success: false,
          error: 'Transcription failed',
          message: `Sarvam returned ${upstreamResponse.status}`,
          details: upstreamPayload ?? upstreamText,
        },
        502
      );
    }

    const transcript = extractTranscript(upstreamPayload);

    if (!transcript) {
      return jsonResponse(
        {
          success: false,
          error: 'Transcription failed',
          message: 'Sarvam response did not include transcript text',
        },
        502
      );
    }

    /** @type {TranscribeSuccessResponse} */
    const responseBody = {
      transcript,
      language,
      confidence: extractConfidence(upstreamPayload),
    };

    return jsonResponse(
      {
        success: true,
        ...responseBody,
      },
      200
    );
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: 'Transcription failed',
        message: error instanceof Error ? error.message : 'Unexpected transcription error',
      },
      500
    );
  }
}

/**
 * @param {EnvBindings} env
 * @returns {string}
 */
function resolveSarvamTranscribeUrl(env) {
  return normalizeString(env.SARVAM_STT_URL) || 'https://api.sarvam.ai/speech-to-text';
}

/**
 * @param {unknown} payload
 * @returns {string}
 */
function extractTranscript(payload) {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const candidate = /** @type {{ transcript?: unknown, text?: unknown, data?: unknown }} */ (payload);

  if (typeof candidate.transcript === 'string' && candidate.transcript.trim()) {
    return candidate.transcript.trim();
  }

  if (typeof candidate.text === 'string' && candidate.text.trim()) {
    return candidate.text.trim();
  }

  if (candidate.data && typeof candidate.data === 'object') {
    const nested = /** @type {{ transcript?: unknown, text?: unknown }} */ (candidate.data);

    if (typeof nested.transcript === 'string' && nested.transcript.trim()) {
      return nested.transcript.trim();
    }

    if (typeof nested.text === 'string' && nested.text.trim()) {
      return nested.text.trim();
    }
  }

  return '';
}

/**
 * @param {unknown} payload
 * @returns {number | undefined}
 */
function extractConfidence(payload) {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const candidate = /** @type {{ confidence?: unknown, data?: unknown }} */ (payload);

  if (typeof candidate.confidence === 'number') {
    return candidate.confidence;
  }

  if (candidate.data && typeof candidate.data === 'object') {
    const nested = /** @type {{ confidence?: unknown }} */ (candidate.data);

    if (typeof nested.confidence === 'number') {
      return nested.confidence;
    }
  }

  return undefined;
}

/**
 * @param {unknown} input
 * @returns {string}
 */
function normalizeString(input) {
  return typeof input === 'string' && input.trim() ? input.trim() : '';
}

/**
 * @param {Blob} blob
 * @returns {string}
 */
function getUploadName(blob) {
  return blob instanceof File && blob.name ? blob.name : 'voice-input.webm';
}

/**
 * @param {string} text
 * @returns {unknown}
 */
function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * @param {unknown} payload
 * @param {number} status
 * @returns {Response}
 */
function jsonResponse(payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  });
}