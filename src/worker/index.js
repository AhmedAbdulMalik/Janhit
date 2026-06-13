<<<<<<< HEAD
// c:\Users\iyand\Downloads\Janhit\src\worker\index.js
=======
// /Users/ahmedabdulmalik/Documents/code/hackprix/Janhit/src/worker/index.js
>>>>>>> 8167d4cb47c82d4d99fa71bfda64dc2cd8d34b18

import { handleGenerateForm } from './routes/generate-form.js';
import { handleProcess } from './routes/process.js';
import { handleSynthesize } from './routes/synthesize.js';
import { handleTranscribe } from './routes/transcribe.js';
<<<<<<< HEAD

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
=======
import { handleVoiceAssist } from './routes/voice-assist.js';
import { CORS_HEADERS, createJsonResponse } from './lib/http.js';

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    try {
      const url = new URL(request.url);

      if (request.method === 'GET' && url.pathname === '/health') {
        return createJsonResponse({
          success: true,
          service: 'janhit-worker',
          status: 'ok',
          timestamp: new Date().toISOString(),
        });
      }

      if (request.method !== 'POST') {
        return createJsonResponse({
          success: false,
          error: 'Method not allowed',
          message: 'Use POST for Janhit API endpoints.',
        }, 405);
      }

      switch (url.pathname) {
        case '/api/voice-assist':
          return await handleVoiceAssist(request, env);
        case '/api/transcribe':
          return await handleTranscribe(request, env);
        case '/api/process':
          return await handleProcess(request, env);
        case '/api/synthesize':
          return await handleSynthesize(request, env);
        case '/api/generate-form':
          return await handleGenerateForm(request, env);
        default:
          return createJsonResponse({
            success: false,
            error: 'Not found',
            message: `No route exists for ${url.pathname}`,
          }, 404);
      }
    } catch (error) {
      return createJsonResponse({
        success: false,
        error: 'Worker failure',
        message: error instanceof Error ? error.message : 'Unexpected worker error',
      }, 500);
    }
  },
};
>>>>>>> 8167d4cb47c82d4d99fa71bfda64dc2cd8d34b18
