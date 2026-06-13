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

  const candidate = payload.data && typeof payload.data === 'object' ? payload.data : payload;
  const audioUrl = getString(candidate.audio_url || candidate.audioUrl || candidate.url || payload.url);

  if (audioUrl) {
    return {
      audioUrl,
      mimeType: getString(candidate.audio_mime_type || candidate.mime_type || payload.audio_mime_type || payload.mime_type, 'audio/wav'),
    };
  }

  const audioList = Array.isArray(payload.audios) ? payload.audios : Array.isArray(candidate.audios) ? candidate.audios : [];
  if (audioList.length > 0) {
    const firstAudio = audioList[0];

    if (typeof firstAudio === 'string' && firstAudio.trim()) {
      return {
        audioUrl: `data:audio/wav;base64,${firstAudio.trim()}`,
        mimeType: 'audio/wav',
      };
    }

    if (firstAudio && typeof firstAudio === 'object') {
      const objectAudioUrl = getString(firstAudio.audio_url || firstAudio.audioUrl || firstAudio.url);
      if (objectAudioUrl) {
        return {
          audioUrl: objectAudioUrl,
          mimeType: getString(firstAudio.audio_mime_type || firstAudio.mime_type || candidate.audio_mime_type || candidate.mime_type || payload.audio_mime_type || payload.mime_type, 'audio/wav'),
        };
      }

      const objectBase64 = getString(firstAudio.audio || firstAudio.audio_content || firstAudio.audioContent || firstAudio.content);
      if (objectBase64) {
        return {
          audioUrl: `data:audio/wav;base64,${objectBase64}`,
          mimeType: getString(firstAudio.audio_mime_type || firstAudio.mime_type || candidate.audio_mime_type || candidate.mime_type || payload.audio_mime_type || payload.mime_type, 'audio/wav'),
        };
      }
    }
  }

  const base64Audio = getString(candidate.audio || candidate.audio_content || candidate.audioContent || candidate.content || payload.audio || payload.audio_content || payload.audioContent || payload.content);
  const mimeType = getString(candidate.audio_mime_type || candidate.mime_type || payload.audio_mime_type || payload.mime_type, 'audio/wav');

  return {
    audioUrl: base64Audio ? `data:${mimeType};base64,${base64Audio}` : '',
    mimeType,
  };
}

const LANGUAGE_CODE_ALIASES = {
  en: 'en-IN',
  hi: 'hi-IN',
  bn: 'bn-IN',
  brx: 'brx-IN',
  doi: 'doi-IN',
  gu: 'gu-IN',
  kn: 'kn-IN',
  kok: 'kok-IN',
  ks: 'ks-IN',
  mai: 'mai-IN',
  ml: 'ml-IN',
  mni: 'mni-IN',
  mr: 'mr-IN',
  ne: 'ne-IN',
  od: 'od-IN',
  pa: 'pa-IN',
  sa: 'sa-IN',
  sat: 'sat-IN',
  sd: 'sd-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  ur: 'ur-IN',
};

function normalizeLanguage(language) {
  const normalized = language.replace('_', '-');

  if (typeof normalized !== 'string' || !normalized.trim()) {
    return DEFAULT_LANGUAGE;
  }

  const raw = normalized.trim();
  if (LANGUAGE_CODE_ALIASES[raw]) {
    return LANGUAGE_CODE_ALIASES[raw];
  }

  if (/^[a-z]{2,3}(-[A-Z]{2})?$/.test(raw)) {
    return raw;
  }

  return DEFAULT_LANGUAGE;
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
