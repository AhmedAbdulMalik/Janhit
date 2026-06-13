// /Users/ahmedabdulmalik/Documents/code/hackprix/Janhit/src/worker/routes/process.js

import { generateGeminiJson } from '../lib/gemini.js';
import { clamp, createJsonResponse, getNumber, getString, readJsonBody } from '../lib/http.js';
import { INTENT_DETECTION_PROMPT, WORKFLOWS } from '../prompts/workflows.js';

export async function handleProcess(request, env) {
  try {
    const body = await readJsonBody(request);
    const transcript = getString(body.transcript);

    if (!transcript) {
      return createJsonResponse({
        success: false,
        error: 'No transcript provided',
        message: 'transcript is required',
      }, 400);
    }

    const context = body.context && typeof body.context === 'object' && !Array.isArray(body.context)
      ? body.context
      : {};

    const data = await processTranscript(transcript, context, env);

    return createJsonResponse({
      success: true,
      data,
    });
  } catch (error) {
    return createJsonResponse({
      success: false,
      error: 'Processing failed',
      message: error instanceof Error ? error.message : 'Unexpected processing error',
    }, 500);
  }
}

export async function processTranscript(transcript, context, env) {
  const fallback = classifyLocally(transcript, context);
  const prompt = [
    'User said:',
    transcript,
    '',
    'Current browser/context JSON:',
    JSON.stringify(context),
    '',
    'Supported workflows JSON:',
    JSON.stringify(WORKFLOWS),
    '',
    'Return only JSON with keys: intent, confidence, entities, clarification_needed, nextQuestion, workflow, responseText.',
  ].join('\n');

  let modelPayload = fallback;

  try {
    modelPayload = await generateGeminiJson(env, INTENT_DETECTION_PROMPT, prompt, fallback);
  } catch {
    modelPayload = fallback;
  }

  return normalizeProcessResult(modelPayload, fallback);
}

function normalizeProcessResult(payload, fallback) {
  const intent = normalizeIntent(getString(payload.intent), fallback.intent);
  const workflow = getString(payload.workflow, intent);
  const workflowDefinition = WORKFLOWS[intent] || WORKFLOWS.municipal_complaint;
  const entities = payload.entities && typeof payload.entities === 'object' && !Array.isArray(payload.entities)
    ? { ...fallback.entities, ...sanitizeRecord(payload.entities) }
    : fallback.entities;
  const missingFields = getMissingFields(workflowDefinition, entities);
  const nextQuestion = getString(payload.nextQuestion, getString(payload.next_question, getDefaultQuestion(workflowDefinition, missingFields)));
  const responseText = getString(payload.responseText, buildResponseText(workflowDefinition, entities, missingFields, nextQuestion));

  return {
    intent,
    confidence: clamp(getNumber(payload.confidence, fallback.confidence), 0, 1),
    entities,
    clarification_needed: typeof payload.clarification_needed === 'boolean'
      ? payload.clarification_needed
      : missingFields.length > 0,
    nextQuestion,
    workflow,
    responseText,
    missingFields,
  };
}

function classifyLocally(transcript, context) {
  const normalized = transcript.toLowerCase();
  const isBanking = includesAny(normalized, [
    'bank',
    'account',
    'transaction',
    'refund',
    'upi',
    'atm',
    'deduct',
    'deduction',
    'unauthorized',
    'unauthorised',
    'ombudsman',
  ]);
  const intent = isBanking ? 'banking_grievance' : 'municipal_complaint';
  const entities = extractEntities(transcript, intent, context);
  const workflowDefinition = WORKFLOWS[intent];
  const missingFields = getMissingFields(workflowDefinition, entities);
  const nextQuestion = getDefaultQuestion(workflowDefinition, missingFields);

  return {
    intent,
    confidence: isBanking ? 0.78 : 0.72,
    entities,
    clarification_needed: missingFields.length > 0,
    nextQuestion,
    workflow: intent,
    responseText: buildResponseText(workflowDefinition, entities, missingFields, nextQuestion),
    missingFields,
  };
}

function extractEntities(transcript, intent, context) {
  const entities = {};
  const normalized = transcript.toLowerCase();

  if (intent === 'municipal_complaint') {
    if (includesAny(normalized, ['streetlight', 'street light', 'light'])) {
      entities.complaint_type = 'broken_streetlight';
    } else if (includesAny(normalized, ['garbage', 'waste', 'trash'])) {
      entities.complaint_type = 'garbage_collection';
    } else if (includesAny(normalized, ['water', 'supply', 'pipeline'])) {
      entities.complaint_type = 'water_supply';
    } else if (includesAny(normalized, ['road', 'pothole', 'drainage', 'sewage'])) {
      entities.complaint_type = includesAny(normalized, ['drainage', 'sewage']) ? 'drainage' : 'road_damage';
    }
  }

  if (intent === 'banking_grievance') {
    if (includesAny(normalized, ['unauthorized', 'unauthorised', 'fraud'])) {
      entities.grievance_type = 'unauthorized_transaction';
    } else if (includesAny(normalized, ['refund', 'failed'])) {
      entities.grievance_type = 'failed_refund';
    } else if (includesAny(normalized, ['double', 'deduct', 'deduction'])) {
      entities.grievance_type = 'double_deduction';
    }
  }

  const locationMatch = transcript.match(/\b(?:at|near|in|from)\s+([A-Za-z0-9\s,.-]{3,80})/i);
  if (locationMatch && locationMatch[1]) {
    entities.location = locationMatch[1].trim();
  }

  const phoneMatch = transcript.match(/(?:\+91[-\s]?)?[6-9]\d{9}\b/);
  if (phoneMatch) {
    entities.contact_number = phoneMatch[0];
  }

  const emailMatch = transcript.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (emailMatch) {
    entities.email = emailMatch[0];
  }

  if (context && typeof context === 'object' && typeof context.currentUrl === 'string') {
    entities.source_url = context.currentUrl;
  }

  entities.description = transcript;
  return entities;
}

function getMissingFields(workflowDefinition, entities) {
  const requiredFields = workflowDefinition.steps.flatMap((step) => step.required_fields);
  return [...new Set(requiredFields)].filter((field) => !getString(entities[field]));
}

function getDefaultQuestion(workflowDefinition, missingFields) {
  if (missingFields.length === 0) {
    return 'I have enough details to prepare this complaint. Please review before submitting.';
  }

  const matchingStep = workflowDefinition.steps.find((step) => step.required_fields.some((field) => missingFields.includes(field)));
  return matchingStep ? matchingStep.question : 'Please share one more detail so I can prepare this correctly.';
}

function buildResponseText(workflowDefinition, entities, missingFields, nextQuestion) {
  const issueText = getString(entities.complaint_type || entities.grievance_type);

  if (missingFields.length === 0) {
    return `I understood this as a ${workflowDefinition.name.toLowerCase()}${issueText ? ` about ${issueText.replaceAll('_', ' ')}` : ''}. I can prepare the draft now.`;
  }

  return `I understood this as a ${workflowDefinition.name.toLowerCase()}. ${nextQuestion}`;
}

function normalizeIntent(intent, fallbackIntent) {
  if (intent && WORKFLOWS[intent]) {
    return intent;
  }

  return WORKFLOWS[fallbackIntent] ? fallbackIntent : 'municipal_complaint';
}

function sanitizeRecord(record) {
  return Object.fromEntries(
    Object.entries(record)
      .filter(([key]) => /^[A-Za-z0-9_-]{1,64}$/.test(key))
      .map(([key, value]) => [key, sanitizeValue(value)])
  );
}

function sanitizeValue(value) {
  if (typeof value === 'string') {
    return value.slice(0, 1000).trim();
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map(sanitizeValue);
  }

  if (value && typeof value === 'object') {
    return sanitizeRecord(value);
  }

  return '';
}

function includesAny(value, terms) {
  return terms.some((term) => value.includes(term));
}
