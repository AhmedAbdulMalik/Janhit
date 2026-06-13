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

function extractTranscript(payload) {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

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
  }

  return '';
}

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
