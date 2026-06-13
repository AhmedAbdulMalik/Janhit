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