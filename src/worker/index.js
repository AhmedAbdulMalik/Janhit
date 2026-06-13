// /Users/ahmedabdulmalik/Documents/code/hackprix/Janhit/src/worker/index.js

import { handleGenerateForm } from './routes/generate-form.js';
import { handleProcess } from './routes/process.js';
import { handleSynthesize } from './routes/synthesize.js';
import { handleTranscribe } from './routes/transcribe.js';
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

