// c:\Users\iyand\Downloads\Janhit\src\worker\index.js

/**
 * Janhit Cloudflare Worker - Main Entry Point
 * Handles API routing for civic assistance workflows
 */

import { handleTranscribe } from './routes/transcribe.js';
import { handleProcess } from './routes/process.js';
import { handleGenerateForm } from './routes/generate-form.js';
import { handleSynthesize } from './routes/synthesize.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * Main worker request handler
 */
export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/api/transcribe' && request.method === 'POST') {
        return await handleTranscribe(request, env);
      }

      if (path === '/api/process' && request.method === 'POST') {
        return await handleProcess(request, env);
      }

      if (path === '/api/generate-form' && request.method === 'POST') {
        return await handleGenerateForm(request, env);
      }

      if (path === '/api/synthesize' && request.method === 'POST') {
        return await handleSynthesize(request, env);
      }

      if (path === '/health' && request.method === 'GET') {
        return new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        });
      }

      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(
        JSON.stringify({
          error: 'Internal server error',
          message: error.message,
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        }
      );
    }
  },
};
