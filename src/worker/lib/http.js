// /Users/ahmedabdulmalik/Documents/code/hackprix/Janhit/src/worker/lib/http.js

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Max-Age': '86400',
};

export const JSON_HEADERS = {
  ...CORS_HEADERS,
  'Content-Type': 'application/json; charset=utf-8',
};

export function createJsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  });
}

export async function readJsonBody(request) {
  const contentType = request.headers.get('Content-Type') || '';

  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error('Expected application/json request body');
  }

  const payload = await request.json();

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('JSON request body must be an object');
  }

  return payload;
}

export async function readTextSafely(response) {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

export function getString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function getNumber(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}
