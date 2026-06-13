<<<<<<< HEAD
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
=======
// /Users/ahmedabdulmalik/Documents/code/hackprix/Janhit/src/worker/routes/transcribe.js

import { createJsonResponse, getString, readTextSafely } from '../lib/http.js';

const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
const DEFAULT_LANGUAGE = 'hi-IN';
const DEFAULT_STT_URL = 'https://api.sarvam.ai/speech-to-text';

export async function handleTranscribe(request, env) {
  try {
    const transcription = await transcribeRequestAudio(request, env);

    return createJsonResponse({
      success: true,
      transcript: transcription.transcript,
      language: transcription.language,
      confidence: transcription.confidence,
      provider: 'sarvam',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Transcription failed';
    const status = message.includes('configured') ? 500 : message.includes('audio') ? 400 : 502;

    return createJsonResponse({
      success: false,
      error: 'Transcription failed',
      message,
    }, status);
  }
}

export async function transcribeRequestAudio(request, env) {
  const formData = await request.formData();
  return transcribeFormData(formData, env);
}

export async function transcribeFormData(formData, env) {
  const apiKey = getString(env.SARVAM_API_KEY);

  if (!apiKey) {
    throw new Error('SARVAM_API_KEY is not configured');
  }

  const audio = formData.get('audio');
  const language = normalizeLanguage(getString(formData.get('language'), DEFAULT_LANGUAGE));

  if (!(audio instanceof Blob)) {
    throw new Error('No audio provided');
  }

  if (audio.size <= 0) {
    throw new Error('Audio file is empty');
  }

  if (audio.size > MAX_AUDIO_BYTES) {
    throw new Error('Audio file is too large');
  }

  const fileName = audio instanceof File && audio.name ? audio.name : 'voice-input.webm';
  const upstreamFormData = new FormData();
  upstreamFormData.append('file', audio, fileName);
  upstreamFormData.append('model', getString(env.SARVAM_STT_MODEL, 'saaras:v3'));
  upstreamFormData.append('language_code', language);

  const mode = getString(formData.get('mode'), getString(env.SARVAM_STT_MODE, 'transcribe'));
  if (mode) {
    upstreamFormData.append('mode', mode);
  }

  const upstreamResponse = await fetch(getString(env.SARVAM_STT_URL, DEFAULT_STT_URL), {
    method: 'POST',
    headers: {
      'api-subscription-key': apiKey,
    },
    body: upstreamFormData,
  });

  if (!upstreamResponse.ok) {
    const details = await readTextSafely(upstreamResponse);
    throw new Error(`Sarvam STT returned ${upstreamResponse.status}${details ? `: ${details}` : ''}`);
  }

  const payload = await upstreamResponse.json();
  const transcript = extractTranscript(payload);

  if (!transcript) {
    throw new Error('Sarvam response did not include transcript text');
  }

  return {
    transcript,
    language,
    confidence: extractConfidence(payload),
    raw: payload,
  };
}

function normalizeLanguage(language) {
  const normalized = language.replace('_', '-');
  return /^[a-z]{2,3}(-[A-Z]{2})?$/.test(normalized) ? normalized : DEFAULT_LANGUAGE;
}

>>>>>>> 8167d4cb47c82d4d99fa71bfda64dc2cd8d34b18
function extractTranscript(payload) {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

<<<<<<< HEAD
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
=======
  const candidate = payload;
  const values = [
    candidate.transcript,
    candidate.text,
    candidate.output,
    candidate.data && typeof candidate.data === 'object' ? candidate.data.transcript : '',
    candidate.data && typeof candidate.data === 'object' ? candidate.data.text : '',
  ];

  for (const value of values) {
    const transcript = getString(value);
    if (transcript) {
      return transcript;
    }
  }

  if (Array.isArray(candidate.results)) {
    return candidate.results
      .map((item) => item && typeof item === 'object' ? getString(item.transcript || item.text) : '')
      .filter(Boolean)
      .join(' ')
      .trim();
>>>>>>> 8167d4cb47c82d4d99fa71bfda64dc2cd8d34b18
  }

  return '';
}

<<<<<<< HEAD
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
=======
function extractConfidence(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload;
  const directConfidence = typeof candidate.confidence === 'number' ? candidate.confidence : null;

  if (directConfidence !== null) {
    return directConfidence;
  }

  if (candidate.data && typeof candidate.data === 'object' && typeof candidate.data.confidence === 'number') {
    return candidate.data.confidence;
  }

  return null;
}
>>>>>>> 8167d4cb47c82d4d99fa71bfda64dc2cd8d34b18
