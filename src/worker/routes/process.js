// c:\Users\iyand\Downloads\Janhit\src\worker\routes\process.js

import { COLLECTION_PROMPT, INTENT_DETECTION_PROMPT, WORKFLOWS } from '../prompts/workflows.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, api-key',
};

/**
 * @typedef {{
 *   transcript: string,
 *   context?: Record<string, unknown>
 * }} ProcessRequestBody
 */

/**
 * @typedef {{
 *   intent: string,
 *   confidence: number,
 *   entities: Record<string, unknown>,
 *   nextQuestion: string,
 *   workflow: string
 * }} ProcessResult
 */

/**
 * @typedef {{
 *   GEMINI_API_KEY?: string,
 *   GEMINI_MODEL?: string
 * }} EnvBindings
 */

/**
 * @param {Request} request
 * @param {EnvBindings} env
 * @returns {Promise<Response>}
 */
export async function handleProcess(request, env) {
  try {
    const body = /** @type {ProcessRequestBody} */ (await request.json());
    const transcript = normalizeString(body.transcript);

    if (!transcript) {
      return jsonResponse(
        {
          success: false,
          error: 'Bad request',
          message: 'No transcript provided',
        },
        400
      );
    }

    const heuristicResult = classifyTranscript(transcript);
    const result = await maybeRefineWithGemini(transcript, body.context || {}, env, heuristicResult);

    return jsonResponse(
      {
        success: true,
        data: result,
        prompt: COLLECTION_PROMPT,
        intentPrompt: INTENT_DETECTION_PROMPT,
      },
      200
    );
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: 'Processing failed',
        message: error instanceof Error ? error.message : 'Unexpected processing error',
      },
      500
    );
  }
}

/**
 * @param {string} transcript
 * @returns {ProcessResult}
 */
function classifyTranscript(transcript) {
  const lower = transcript.toLowerCase();

  if (containsAny(lower, ['bank', 'transaction', 'refund', 'upi', 'debit', 'credit', 'account'])) {
    return {
      intent: 'banking_grievance',
      confidence: 0.89,
      entities: inferEntities(lower),
      nextQuestion: 'Please share the bank name and a short description of the issue.',
      workflow: 'banking_grievance',
    };
  }

  if (containsAny(lower, ['streetlight', 'street light', 'garbage', 'water', 'road', 'drainage', 'sewer', 'municipal'])) {
    return {
      intent: 'municipal_complaint',
      confidence: 0.92,
      entities: inferEntities(lower),
      nextQuestion: 'Which area is affected and what exactly needs to be fixed?',
      workflow: 'municipal_complaint',
    };
  }

  return {
    intent: 'municipal_complaint',
    confidence: 0.64,
    entities: inferEntities(lower),
    nextQuestion: 'Tell me the issue type, location, and what outcome you want.',
    workflow: 'municipal_complaint',
  };
}

/**
 * @param {string} transcript
 * @param {Record<string, unknown>} context
 * @param {EnvBindings} env
 * @param {ProcessResult} fallback
 * @returns {Promise<ProcessResult>}
 */
async function maybeRefineWithGemini(transcript, context, env, fallback) {
  const apiKey = normalizeString(env.GEMINI_API_KEY);
  const model = normalizeString(env.GEMINI_MODEL) || 'gemini-2.5-flash';

  if (!apiKey) {
    return fallback;
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `${INTENT_DETECTION_PROMPT}\n\nTranscript: ${transcript}\n\nContext: ${JSON.stringify(context)}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      }),
    });

    const text = await response.text();

    if (!response.ok) {
      return fallback;
    }

    const payload = text ? safeParseJson(text) : null;
    const refined = extractGeminiResult(payload, fallback);
    return refined;
  } catch {
    return fallback;
  }
}

/**
 * @param {unknown} payload
 * @param {ProcessResult} fallback
 * @returns {ProcessResult}
 */
function extractGeminiResult(payload, fallback) {
  if (!payload || typeof payload !== 'object') {
    return fallback;
  }

  const candidate = /** @type {{ candidates?: unknown }} */ (payload);
  const candidates = Array.isArray(candidate.candidates) ? candidate.candidates : [];
  const firstCandidate = candidates[0];

  if (!firstCandidate || typeof firstCandidate !== 'object') {
    return fallback;
  }

  const parts = Array.isArray(/** @type {{ content?: { parts?: unknown } }} */ (firstCandidate).content?.parts)
    ? /** @type {{ content?: { parts?: unknown } }} */ (firstCandidate).content?.parts
    : [];
  const text = typeof parts[0] === 'object' && parts[0] !== null && typeof /** @type {{ text?: unknown }} */ (parts[0]).text === 'string'
    ? /** @type {{ text?: string }} */ (parts[0]).text
    : '';

  if (!text) {
    return fallback;
  }

  const parsed = safeParseJson(text);

  if (!parsed || typeof parsed !== 'object') {
    return fallback;
  }

  const result = /** @type {Partial<ProcessResult>} */ (parsed);

  return {
    intent: typeof result.intent === 'string' && result.intent.trim() ? result.intent : fallback.intent,
    confidence: typeof result.confidence === 'number' ? result.confidence : fallback.confidence,
    entities: isRecord(result.entities) ? result.entities : fallback.entities,
    nextQuestion: typeof result.nextQuestion === 'string' && result.nextQuestion.trim() ? result.nextQuestion : fallback.nextQuestion,
    workflow: typeof result.workflow === 'string' && result.workflow.trim() ? result.workflow : fallback.workflow,
  };
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function containsAny(value, patterns) {
  return patterns.some((pattern) => value.includes(pattern));
}

/**
 * @param {string} transcript
 * @returns {Record<string, unknown>}
 */
function inferEntities(transcript) {
  const entities = {};
  const locationMatch = transcript.match(/(?:at|in|near)\s+([a-z0-9 ,.-]{3,})/i);

  if (locationMatch) {
    entities.location = locationMatch[1].trim();
  }

  if (transcript.includes('water')) {
    entities.complaint_type = 'water_supply';
  }

  if (transcript.includes('garbage') || transcript.includes('trash')) {
    entities.complaint_type = 'garbage_collection';
  }

  if (transcript.includes('streetlight') || transcript.includes('street light')) {
    entities.complaint_type = 'streetlight';
  }

  if (transcript.includes('bank')) {
    entities.complaint_type = 'banking';
  }

  return entities;
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

/**
 * @param {string} text
 * @returns {unknown}
 */
function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

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