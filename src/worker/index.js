// c:\Users\iyand\Downloads\Janhit\src\worker\index.js

import { handleGenerateForm } from './routes/generate-form.js';
import { handleProcess } from './routes/process.js';
import { handleSynthesize } from './routes/synthesize.js';
import { handleTranscribe } from './routes/transcribe.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, api-key',
};

/** @type {Record<string, (request: Request, env: EnvBindings) => Promise<Response>>} */
const ROUTES = {
  '/api/transcribe': handleTranscribe,
  '/api/process': handleProcess,
  '/api/generate-form': handleGenerateForm,
  '/api/synthesize': handleSynthesize,
};

/**
 * @typedef {{
 *   SARVAM_API_KEY?: string,
 *   SARVAM_STT_URL?: string,
 *   SARVAM_TTS_URL?: string,
 *   GEMINI_API_KEY?: string,
 *   GEMINI_MODEL?: string
 * }} EnvBindings
 */

export default {
  /**
   * @param {Request} request
   * @param {EnvBindings} env
   * @returns {Promise<Response>}
   */
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: JSON_HEADERS });
    }

    const url = new URL(request.url);
    const handler = ROUTES[url.pathname];

    if (!handler) {
      return jsonResponse(
        {
          success: false,
          error: 'Not found',
          message: `No route matches ${url.pathname}`,
        },
        404
      );
    }

    if (request.method !== 'POST') {
      return jsonResponse(
        {
          success: false,
          error: 'Method not allowed',
          message: `Use POST for ${url.pathname}`,
        },
        405
      );
    }

    return handler(request, env);
  },
};

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