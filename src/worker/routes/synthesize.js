<<<<<<< HEAD
// c:\Users\iyand\Downloads\Janhit\src\worker\routes\synthesize.js

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, api-key',
};

/**
 * @typedef {{
 *   text: string,
 *   language?: string
 * }} SynthesizeRequestBody
 */

/**
 * @typedef {{
 *   SARVAM_API_KEY?: string,
 *   SARVAM_TTS_URL?: string
 * }} EnvBindings
 */

/**
 * @param {Request} request
 * @param {EnvBindings} env
 * @returns {Promise<Response>}
 */
export async function handleSynthesize(request, env) {
  try {
    const body = /** @type {SynthesizeRequestBody} */ (await request.json());
    const text = normalizeString(body.text);
    const language = normalizeString(body.language) || 'en';
    const apiKey = normalizeString(env.SARVAM_API_KEY);

    if (!text) {
      return jsonResponse(
        {
          success: false,
          error: 'Bad request',
          message: 'No text provided',
        },
        400
      );
    }

    if (!apiKey) {
      return jsonResponse(
        {
          success: false,
          error: 'Synthesis unavailable',
          message: 'SARVAM_API_KEY is not configured',
        },
        500
      );
    }

    const upstreamResponse = await fetch(resolveSarvamTtsUrl(env), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        language,
        model: 'bulbul:v3',
      }),
    });

    const upstreamText = await upstreamResponse.text();
    const upstreamPayload = upstreamText ? safeParseJson(upstreamText) : null;

    if (!upstreamResponse.ok) {
      return jsonResponse(
        {
          success: false,
          error: 'Synthesis failed',
          message: `Sarvam returned ${upstreamResponse.status}`,
          details: upstreamPayload ?? upstreamText,
        },
        502
      );
    }

    const audioUrl = extractAudioUrl(upstreamPayload);

    if (!audioUrl) {
      return jsonResponse(
        {
          success: false,
          error: 'Synthesis failed',
          message: 'Sarvam response did not include audio output',
        },
        502
      );
    }

    return jsonResponse(
      {
        success: true,
        audio_url: audioUrl,
        language,
      },
      200
    );
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: 'Synthesis failed',
        message: error instanceof Error ? error.message : 'Unexpected synthesis error',
      },
      500
    );
  }
}

/**
 * @param {EnvBindings} env
 * @returns {string}
 */
function resolveSarvamTtsUrl(env) {
  return normalizeString(env.SARVAM_TTS_URL) || 'https://api.sarvam.ai/text-to-speech';
}

/**
 * @param {unknown} payload
 * @returns {string}
 */
function extractAudioUrl(payload) {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const candidate = /** @type {{ audio_url?: unknown, audioUrl?: unknown, data?: unknown }} */ (payload);

  if (typeof candidate.audio_url === 'string' && candidate.audio_url.trim()) {
    return candidate.audio_url.trim();
  }

  if (typeof candidate.audioUrl === 'string' && candidate.audioUrl.trim()) {
    return candidate.audioUrl.trim();
  }

  if (candidate.data && typeof candidate.data === 'object') {
    const nested = /** @type {{ audio_url?: unknown, audioUrl?: unknown }} */ (candidate.data);

    if (typeof nested.audio_url === 'string' && nested.audio_url.trim()) {
      return nested.audio_url.trim();
    }

    if (typeof nested.audioUrl === 'string' && nested.audioUrl.trim()) {
      return nested.audioUrl.trim();
    }
  }

  return '';
}

/**
 * @param {unknown} input
 * @returns {string}
 */
function normalizeString(input) {
  return typeof input === 'string' && input.trim() ? input.trim() : '';
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
// /Users/ahmedabdulmalik/Documents/code/hackprix/Janhit/src/worker/routes/synthesize.js

import { createJsonResponse, getString, readJsonBody, readTextSafely } from '../lib/http.js';

const DEFAULT_LANGUAGE = 'hi-IN';
const DEFAULT_TTS_URL = 'https://api.sarvam.ai/text-to-speech';
const DEFAULT_SPEAKER = 'anushka';
const MAX_TEXT_LENGTH = 1400;

export async function handleSynthesize(request, env) {
  try {
    const body = await readJsonBody(request);
    const text = getString(body.text);
    const language = normalizeLanguage(getString(body.language, DEFAULT_LANGUAGE));

    if (!text) {
      return createJsonResponse({
        success: false,
        error: 'No text provided',
        message: 'text is required',
      }, 400);
    }

    const synthesis = await synthesizeText(text, language, env);

    return createJsonResponse({
      success: true,
      audio_url: synthesis.audioUrl,
      audio_mime_type: synthesis.mimeType,
      language,
      provider: 'sarvam',
    });
  } catch (error) {
    return createJsonResponse({
      success: false,
      error: 'Synthesis failed',
      message: error instanceof Error ? error.message : 'Unexpected synthesis error',
    }, 502);
  }
}

export async function synthesizeText(text, language, env) {
  const apiKey = getString(env.SARVAM_API_KEY);

  if (!apiKey) {
    throw new Error('SARVAM_API_KEY is not configured');
  }

  const safeText = text.trim().slice(0, MAX_TEXT_LENGTH);

  if (!safeText) {
    throw new Error('Text is empty');
  }

  const response = await fetch(getString(env.SARVAM_TTS_URL, DEFAULT_TTS_URL), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'api-subscription-key': apiKey,
    },
    body: JSON.stringify({
      text: safeText,
      target_language_code: normalizeLanguage(language),
      speaker: getString(env.SARVAM_TTS_SPEAKER, DEFAULT_SPEAKER),
      model: getString(env.SARVAM_TTS_MODEL, 'bulbul:v3'),
    }),
  });

  if (!response.ok) {
    const details = await readTextSafely(response);
    throw new Error(`Sarvam TTS returned ${response.status}${details ? `: ${details}` : ''}`);
  }

  const contentType = response.headers.get('Content-Type') || '';

  if (contentType.includes('application/json')) {
    const payload = await response.json();
    const extracted = extractAudioFromJson(payload);

    if (!extracted.audioUrl) {
      throw new Error('Sarvam response did not include audio content');
    }

    return extracted;
  }

  const audioBuffer = await response.arrayBuffer();
  const mimeType = contentType || 'audio/wav';

  return {
    audioUrl: `data:${mimeType};base64,${arrayBufferToBase64(audioBuffer)}`,
    mimeType,
  };
}

function extractAudioFromJson(payload) {
  if (!payload || typeof payload !== 'object') {
    return {
      audioUrl: '',
      mimeType: 'audio/wav',
    };
  }

  const audioUrl = getString(payload.audio_url || payload.audioUrl || payload.url);
  if (audioUrl) {
    return {
      audioUrl,
      mimeType: getString(payload.audio_mime_type || payload.mime_type, 'audio/wav'),
    };
  }

  const base64Audio = getString(payload.audio || payload.audio_content || payload.audioContent);
  const mimeType = getString(payload.audio_mime_type || payload.mime_type, 'audio/wav');

  return {
    audioUrl: base64Audio ? `data:${mimeType};base64,${base64Audio}` : '',
    mimeType,
  };
}

function normalizeLanguage(language) {
  const normalized = language.replace('_', '-');
  return /^[a-z]{2,3}(-[A-Z]{2})?$/.test(normalized) ? normalized : DEFAULT_LANGUAGE;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}
>>>>>>> 8167d4cb47c82d4d99fa71bfda64dc2cd8d34b18
