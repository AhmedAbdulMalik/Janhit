// c:\Users\iyand\Downloads\Janhit\src\worker\routes\transcribe.js

/**
 * Speech-to-text endpoint backed by Sarvam Saaras V3.
 */

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function handleTranscribe(request, env) {
  try {
    const apiKey = typeof env.SARVAM_API_KEY === 'string' ? env.SARVAM_API_KEY.trim() : '';

    if (!apiKey) {
      return createJsonResponse(
        {
          error: 'Transcription unavailable',
          message: 'SARVAM_API_KEY is not configured',
        },
        500
      );
    }

    const requestFormData = await request.formData();
    const audioBlob = requestFormData.get('audio');
    const language = getNormalizedString(requestFormData.get('language'), 'en');

    if (!(audioBlob instanceof File) && !(audioBlob instanceof Blob)) {
      return createJsonResponse({ error: 'No audio provided' }, 400);
    }

    const upstreamFormData = new FormData();
    upstreamFormData.append(
      'file',
      audioBlob,
      audioBlob instanceof File && audioBlob.name? audioBlob.name : 'voice-input.wav']
    );
    upstreamFormData.append('model', 'saaras:v3');
    upstreamFormData.append('mode', 'translate');
    upstreamFormData.append('language_code', language);

    const upstreamResponse = await fetch(getSarvamTranscribeUrl(env), {
      method: 'POST',
      headers: {
        'api-key': apiKey,
      },
      body: upstreamFormData,
    });

    if (!upstreamResponse.ok) {
      const upstreamBody = await readUpstreamBody(upstreamResponse);
      return createJsonResponse(
        {
          error: 'Transcription failed',
          message: `Sarvam returned ${upstreamResponse.status}`,
          details: upstreamBody,
        },
        502
      );
    }

    const upstreamPayload = await upstreamResponse.json();
    const transcript = extractTranscript(upstreamPayload);

    if (!transcript) {
      return createJsonResponse(
        {
          error: 'Transcription failed',
          message: 'Sarvam response did not include transcript text',
        },
        502
      );
    }

    return createJsonResponse(
      {
        success: true,
        transcript,
        language,
      },
      200
    );
  } catch (error) {
    return createJsonResponse(
      {
        error: 'Transcription failed',
        message: error instanceof Error ? error.message : 'Unexpected transcription error',
      },
      500
    );
  }
}

function getSarvamTranscribeUrl(env) {
  const configuredUrl = typeof env.SARVAM_STT_URL === 'string' ? env.SARVAM_STT_URL.trim() : '';
  return configuredUrl || 'https://api.sarvam.ai/speech-to-text';
}

function extractTranscript(payload) {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const directTranscript = getNormalizedString(payload.transcript, '');

  if (directTranscript) {
    return directTranscript;
  }

  const textTranscript = getNormalizedString(payload.text, '');

  if (textTranscript) {
    return textTranscript;
  }

  const dataTranscript = payload.data && typeof payload.data === 'object'
    ? getNormalizedString(payload.data.transcript, '')
    : '';

  if (dataTranscript) {
    return dataTranscript;
  }

  return '';
}

function getNormalizedString(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

async function readUpstreamBody(response) {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function createJsonResponse(payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  });
}
