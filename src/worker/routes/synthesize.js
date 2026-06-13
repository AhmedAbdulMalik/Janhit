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
