// /Users/ahmedabdulmalik/Documents/code/hackprix/Janhit/src/worker/lib/gemini.js

import { getString, readTextSafely } from './http.js';

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

export async function generateGeminiJson(env, systemPrompt, userPrompt, fallbackPayload) {
  const apiKey = getString(env.GEMINI_API_KEY);

  if (!apiKey) {
    return fallbackPayload;
  }

  const model = encodeURIComponent(getString(env.GEMINI_MODEL, DEFAULT_GEMINI_MODEL));
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        topP: 0.8,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const details = await readTextSafely(response);
    throw new Error(`Gemini returned ${response.status}${details ? `: ${details}` : ''}`);
  }

  const payload = await response.json();
  const text = extractGeminiText(payload);
  const parsed = parseJsonObject(text);

  return parsed || fallbackPayload;
}

function extractGeminiText(payload) {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const firstCandidate = candidates[0];

  if (!firstCandidate || typeof firstCandidate !== 'object') {
    return '';
  }

  const content = firstCandidate.content && typeof firstCandidate.content === 'object' ? firstCandidate.content : null;
  const parts = content && Array.isArray(content.parts) ? content.parts : [];

  return parts
    .map((part) => part && typeof part === 'object' && typeof part.text === 'string' ? part.text : '')
    .join('')
    .trim();
}

function parseJsonObject(text) {
  if (!text) {
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }

    try {
      const parsed = JSON.parse(match[0]);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}
