// /Users/ahmedabdulmalik/Documents/code/hackprix/Janhit/src/worker/routes/process.js

import { generateGeminiJson } from '../lib/gemini.js';
import { clamp, createJsonResponse, getNumber, getString, readJsonBody } from '../lib/http.js';
import { INTENT_DETECTION_PROMPT, WORKFLOWS } from '../prompts/workflows.js';
import { generateDomAction } from '../lib/dom_agent.js';

/**
 * @typedef {Record<string, unknown>} JsonRecord
 */

/**
 * @typedef {{ step: number; question: string; required_fields: string[] }} WorkflowStep
 * @typedef {{ id: string; name: string; description: string; category: string; examples: string[]; steps: WorkflowStep[] }} WorkflowDefinition
 * @typedef {{ title?: string; visibleText?: string; elements?: Array<JsonRecord> }} PageSnapshot
 * @typedef {{ page?: PageSnapshot; url?: string; currentUrl?: string; title?: string; visibleText?: string; elements?: Array<JsonRecord>; user_profile?: JsonRecord; viewport?: unknown; language?: string }} ContextRecord
 */

/**
 * @param {Request} request
 * @param {unknown} env
 */
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

/**
 * @param {string} transcript
 * @param {ContextRecord} context
 * @param {unknown} env
 */
export async function processTranscript(transcript, context, env) {
  const fallback = classifyLocally(transcript, context);
  const prompt = [
    'User said:',
    transcript,
    '',
    'Current browser/context JSON:',
    JSON.stringify(context),
    '',
    'Return only JSON with keys: intent, confidence, entities, clarification_needed, nextQuestion, workflow, responseText, browserAction.',
  ].join('\n');

  let modelPayload = fallback;

  try {
    modelPayload = await generateGeminiJson(env, INTENT_DETECTION_PROMPT, prompt, fallback);
  } catch {
    modelPayload = fallback;
  }

  return normalizeProcessResult(modelPayload, fallback, transcript, context);
}

/**
 * @param {JsonRecord} payload
 * @param {JsonRecord} fallback
 * @param {string} transcript
 * @param {ContextRecord} context
 */
function normalizeProcessResult(payload, fallback, transcript, context) {
  const payloadSafe = /** @type {{ browserAction?: unknown; data?: unknown; confidence?: unknown; entities?: unknown; language?: unknown; workflow?: unknown; nextQuestion?: unknown; next_question?: unknown; responseText?: unknown; clarification_needed?: unknown; intent?: unknown }} */ (payload);
  const fallbackSafe = /** @type {{ browserAction?: unknown; confidence?: unknown; entities?: unknown; responseText?: unknown; intent?: unknown }} */ (fallback);

  const intent = normalizeIntent(getString(payloadSafe.intent), /** @type {string} */ (fallbackSafe.intent));
  const workflow = getString(payloadSafe.workflow, intent);
  const workflowDefinition = isWorkflowKey(intent) ? /** @type {WorkflowDefinition} */ (WORKFLOWS[intent]) : null;
  const fallbackEntities = /** @type {JsonRecord} */ (fallbackSafe.entities && typeof fallbackSafe.entities === 'object' && !Array.isArray(fallbackSafe.entities) ? fallbackSafe.entities : {});
  const payloadEntities = payloadSafe.entities && typeof payloadSafe.entities === 'object' && !Array.isArray(payloadSafe.entities)
    ? /** @type {JsonRecord} */ (payloadSafe.entities)
    : {};
  const entities = payloadEntities && Object.keys(payloadEntities).length > 0
    ? { ...fallbackEntities, ...sanitizeRecord(payloadEntities) }
    : fallbackEntities;

  const missingFields = workflowDefinition ? getMissingFields(workflowDefinition, entities) : [];
  const nextQuestion = getString(
    payloadSafe.nextQuestion,
    getString(payloadSafe.next_question, workflowDefinition ? getDefaultQuestion(workflowDefinition, missingFields) : '')
  );

  const pageContext = context.page && typeof context.page === 'object' ? context.page : context;
  const domAction = generateDomAction({
    transcript,
    detected_language: getString(payloadSafe.language) || getString(context.language) || 'en',
    page_url: getString(context.url) || getString(context.currentUrl) || '',
    page_title: getString(context.title) || '',
    dom_snapshot: pageContext,
    interactive_elements: Array.isArray(pageContext.elements) ? pageContext.elements : (Array.isArray(context.elements) ? context.elements : []),
    user_profile: context.user_profile || {},
    viewport: context.viewport || null,
  });

  const responseText = getString(
    payloadSafe.responseText,
    workflowDefinition ? buildResponseText(workflowDefinition, entities, missingFields, nextQuestion) : buildGeneralResponse(transcript, domAction, context, nextQuestion)
  );
  const finalResponseText = avoidEchoResponse(transcript, responseText, domAction, context, nextQuestion);

  const browserAction = normalizeBrowserAction(
    payloadSafe.browserAction ||
    (payloadSafe.data && typeof payloadSafe.data === 'object' ? /** @type {{ browserAction?: unknown }} */ (payloadSafe.data).browserAction : undefined)
  ) || normalizeBrowserAction(fallbackSafe.browserAction) || inferBrowserAction(transcript, intent, context);

  return {
    intent,
    confidence: clamp(getNumber(
      typeof payloadSafe.confidence === 'number' ? payloadSafe.confidence : undefined,
      typeof fallbackSafe.confidence === 'number' ? fallbackSafe.confidence : undefined
    ), 0, 1),
    entities,
    clarification_needed: typeof payloadSafe.clarification_needed === 'boolean'
      ? payloadSafe.clarification_needed
      : missingFields.length > 0,
    nextQuestion,
    workflow,
    responseText: finalResponseText,
    missingFields,
    browserAction,
    domAction,
  };
}

/**
 * @param {string} intent
 * @param {string} fallbackIntent
 * @returns {string}
 */
function normalizeIntent(intent, fallbackIntent) {
  if (typeof intent === 'string' && intent.trim()) {
    return intent.trim();
  }

  if (typeof fallbackIntent === 'string' && fallbackIntent.trim()) {
    return fallbackIntent.trim();
  }

  return 'general';
}

/**
 * @param {unknown} value
 * @returns {value is keyof typeof WORKFLOWS}
 */
function isWorkflowKey(value) {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(WORKFLOWS, value);
}

/**
 * @param {unknown} rawAction
 * @returns {JsonRecord | null}
 */
function normalizeBrowserAction(rawAction) {
  if (!rawAction || typeof rawAction !== 'object' || Array.isArray(rawAction)) {
    return null;
  }

  const candidate = /** @type {{ type?: unknown, targetId?: unknown, target_id?: unknown, targetSelector?: unknown, selector?: unknown, value?: unknown, label?: unknown }} */ (rawAction);
  const type = typeof candidate.type === 'string' ? candidate.type.trim().toLowerCase() : 'none';
  const allowedTypes = ['none', 'highlight', 'scroll_to', 'focus', 'click', 'fill_field'];

  if (!allowedTypes.includes(type)) {
    return null;
  }

  const targetId = typeof candidate.targetId === 'string' && candidate.targetId.trim()
    ? candidate.targetId.trim()
    : typeof candidate.target_id === 'string' && candidate.target_id.trim()
      ? candidate.target_id.trim()
      : null;

  const targetSelector = typeof candidate.targetSelector === 'string' && candidate.targetSelector.trim()
    ? candidate.targetSelector.trim()
    : typeof candidate.selector === 'string' && candidate.selector.trim()
      ? candidate.selector.trim()
      : '';

  const value = typeof candidate.value === 'string' ? candidate.value.slice(0, 1000) : '';
  const label = typeof candidate.label === 'string' ? candidate.label.slice(0, 120) : '';

  if (type === 'none') {
    return null;
  }

  return {
    type,
    targetId,
    targetSelector,
    value,
    label,
  };
}

/**
 * @param {string} transcript
 * @param {ContextRecord} context
 * @returns {JsonRecord}
 */
function classifyLocally(transcript, context) {
  const normalized = transcript.toLowerCase();

  // Prefer signals from the page DOM/context when available
  const page = context && typeof context === 'object' ? context.page || context : null;
  const pageTitle = page && typeof page.title === 'string' ? page.title.toLowerCase() : '';
  const pageText = page && typeof page.visibleText === 'string' ? page.visibleText.toLowerCase() : '';
  const elementArray = Array.isArray(page?.elements) ? /** @type {Array<JsonRecord>} */ (page.elements) : [];
  const elementLabels = elementArray.map((e) => ((e && e.label) || e.name || e.text || '')).join(' ').toLowerCase();

  const formLike = Array.isArray(page?.elements) && page.elements.length >= 2;
  const pageSignals = pageTitle + ' ' + pageText + ' ' + elementLabels;
  const formKeywords = ['form', 'registration', 'sign up', 'apply', 'survey', 'your answer', 'email', 'name', 'mobile', 'search', 'url', 'link'];
  const isPageInteraction = formLike || includesAny(pageSignals, formKeywords) || includesAny(normalized, ['highlight', 'click', 'focus', 'fill', 'search', 'where is', 'show me', 'open', 'find', 'locate']);

  const intent = isPageInteraction ? 'page_action' : 'general';

  const entities = extractEntities(transcript, intent, context);
  const workflowDefinition = isWorkflowKey(intent) ? /** @type {WorkflowDefinition} */ (WORKFLOWS[intent]) : null;
  const missingFields = workflowDefinition ? getMissingFields(workflowDefinition, entities) : [];
  const nextQuestion = '';
  const responseText = buildGeneralResponse(transcript, null, context, '');

  return {
    intent,
    confidence: 0.72,
    entities,
    clarification_needed: missingFields.length > 0,
    nextQuestion,
    workflow: intent,
    responseText,
    missingFields,
    browserAction: inferBrowserAction(transcript, intent, context),
  };
}

/**
 * @param {string} transcript
 * @param {string} intent
 * @param {JsonRecord} context
 * @returns {JsonRecord}
 */
/**
 * @param {string} transcript
 * @param {string} intent
 * @param {JsonRecord} context
 * @returns {JsonRecord}
 */
/**
 * @param {string} transcript
 * @param {string} intent
 * @param {ContextRecord} context
 * @returns {JsonRecord}
 */
function extractEntities(transcript, intent, context) {
  const entities = /** @type {JsonRecord} */ ({});
  const normalized = transcript.toLowerCase();

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

/**
 * @param {string} transcript
 * @param {string} _intent
 * @param {ContextRecord} context
 * @returns {JsonRecord | null}
 */
function inferBrowserAction(transcript, _intent, context) {
  if (!context || typeof context !== 'object') {
    return null;
  }

  const pageContext = context.page && typeof context.page === 'object' ? context.page : null;
  if (!pageContext || !Array.isArray(pageContext.elements)) {
    return null;
  }

  const normalized = transcript.toLowerCase();
  const elements = /** @type {Array<Record<string, unknown>>} */ (pageContext.elements);

  const fieldTarget = findBestFieldElement(elements, normalized);
  if (fieldTarget && includesAny(normalized, ['fill', 'enter', 'type', 'set', 'update'])) {
    return {
      type: 'fill_field',
      targetId: fieldTarget.id || null,
      targetSelector: fieldTarget.selector || '',
      value: detectFillValue(normalized) || '',
      label: `Fill ${fieldTarget.label || fieldTarget.name || fieldTarget.text || 'field'}`,
    };
  }

  if (includesAny(normalized, ['where is', 'show me', 'highlight', 'find the', 'locate the', 'point to'])) {
    const target = findBestClickableElement(elements, normalized) || fieldTarget;
    if (target) {
      return {
        type: 'highlight',
        targetId: target.id || null,
        targetSelector: target.selector || '',
        label: `Here is ${target.label || target.text || target.name || 'the element'}`,
      };
    }
  }

  if (includesAny(normalized, ['click', 'press', 'tap', 'submit', 'continue', 'next'])) {
    const target = findBestClickableElement(elements, normalized);
    if (target) {
      return {
        type: 'click',
        targetId: target.id || null,
        targetSelector: target.selector || '',
        label: `Click ${target.label || target.text || target.name || 'the item'}`,
      };
    }
  }

  if (includesAny(normalized, ['focus', 'go to', 'select', 'choose'])) {
    const target = fieldTarget || findBestClickableElement(elements, normalized);
    if (target) {
      return {
        type: 'focus',
        targetId: target.id || null,
        targetSelector: target.selector || '',
        label: `Focus ${target.label || target.text || target.name || 'the element'}`,
      };
    }
  }

  return null;
}

function buildGeneralResponse(transcript, domAction, context, nextQuestion) {
  if (domAction && typeof domAction.spoken_text === 'string' && domAction.spoken_text.trim()) {
    return domAction.spoken_text.trim();
  }

  const page = context && typeof context === 'object' ? context.page || context : null;
  const pageTitle = page && typeof page.title === 'string' ? page.title.trim() : '';
  const pageText = page && typeof page.visibleText === 'string' ? page.visibleText : '';
  const topElements = Array.isArray(page?.elements)
    ? page.elements.slice(0, 5).map((element) => sanitizeValueText(element.label || element.name || element.placeholder || element.text || '')).filter(Boolean)
    : [];

  if (pageTitle) {
    const summary = topElements.length > 0 ? `I see ${topElements.join(', ')}.` : '';
    return `You’re on ${pageTitle}. ${summary}`.trim();
  }

  if (pageText.trim()) {
    return `This page says: ${pageText.trim().split(/\s+/).slice(0, 18).join(' ')}.`;
  }

  if (includesAny(transcript.toLowerCase(), ['where', 'search', 'url', 'link', 'button', 'field', 'input', 'highlight', 'click', 'fill'])) {
    return 'Finding the best match on the page.';
  }

  return 'Finding the best match on the page.';
}

function avoidEchoResponse(transcript, responseText, domAction, context, nextQuestion) {
  const rawTranscript = (transcript || '').trim().toLowerCase();
  const rawResponse = (responseText || '').trim();

  if (!rawResponse) {
    return buildGeneralResponse(transcript, domAction, context, nextQuestion);
  }

  const normalizedResponse = rawResponse.toLowerCase();
  if (rawTranscript && (normalizedResponse === rawTranscript || normalizedResponse.includes(rawTranscript))) {
    return buildGeneralResponse(transcript, domAction, context, nextQuestion);
  }

  return rawResponse;
}

function sanitizeValueText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

/**
 * @param {Array<JsonRecord>} elements
 * @param {string} normalizedTranscript
 * @returns {JsonRecord | null}
 */
/**
 * @param {Array<JsonRecord>} elements
 * @param {string} normalizedTranscript
 * @returns {JsonRecord | null}
 */
function findBestFieldElement(elements, normalizedTranscript) {
  const fieldNames = ['email', 'phone', 'contact', 'name', 'address', 'description', 'search', 'url', 'link', 'message'];
  for (const key of fieldNames) {
    if (normalizedTranscript.includes(key)) {
      const matching = elements.find((element) => {
        const label = typeof element.label === 'string' ? element.label.toLowerCase() : '';
        const name = typeof element.name === 'string' ? element.name.toLowerCase() : '';
        const text = typeof element.text === 'string' ? element.text.toLowerCase() : '';
        return label.includes(key) || name.includes(key) || text.includes(key);
      });
      if (matching) {
        return matching;
      }
    }
  }

  return elements.find((element) => {
    const text = (typeof element.text === 'string' ? element.text : '').toLowerCase();
    return text.includes('search') || text.includes('submit') || text.includes('next');
  }) || null;
}

/**
 * @param {Array<JsonRecord>} elements
 * @param {string} normalizedTranscript
 * @returns {JsonRecord | null}
 */
/**
 * @param {Array<JsonRecord>} elements
 * @param {string} normalizedTranscript
 * @returns {JsonRecord | null}
 */
function findBestClickableElement(elements, normalizedTranscript) {
  const clickableElements = elements.filter((element) => element.clickable === true || element.role === 'button' || element.role === 'link');
  if (!clickableElements.length) {
    return null;
  }

  const keywords = ['submit', 'continue', 'next', 'save', 'search', 'apply', 'send', 'login', 'sign in', 'agree'];
  for (const keyword of keywords) {
    if (normalizedTranscript.includes(keyword)) {
      const match = clickableElements.find((element) => {
        const label = typeof element.label === 'string' ? element.label.toLowerCase() : '';
        const text = typeof element.text === 'string' ? element.text.toLowerCase() : '';
        const name = typeof element.name === 'string' ? element.name.toLowerCase() : '';
        return label.includes(keyword) || text.includes(keyword) || name.includes(keyword);
      });
      if (match) {
        return match;
      }
    }
  }

  return clickableElements[0] || null;
}

/**
 * @param {string} normalizedTranscript
 * @param {JsonRecord} element
 * @returns {string}
 */
/**
 * @param {string} normalizedTranscript
 * @param {JsonRecord} element
 * @returns {string}
 */
/**
 * @param {string} normalizedTranscript
 * @returns {string}
 */
function detectFillValue(normalizedTranscript) {
  if (normalizedTranscript.includes('email')) {
    return extractValue(normalizedTranscript, /([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i);
  }

  if (normalizedTranscript.includes('phone') || normalizedTranscript.includes('contact')) {
    return extractValue(normalizedTranscript, /(?:\+91[-\s]?)?[6-9]\d{9}\b/);
  }

  const quoted = normalizedTranscript.match(/"([^"]+)"/);
  if (quoted && quoted[1]) {
    return quoted[1].trim();
  }

  return '';
}

/**
 * @param {string} text
 * @param {RegExp} pattern
 * @returns {string}
 */
/**
 * @param {string} text
 * @param {RegExp} pattern
 * @returns {string}
 */
function extractValue(text, pattern) {
  const match = text.match(pattern);
  return match && match[0] ? match[0].trim() : '';
}

/**
 * @param {JsonRecord} workflowDefinition
 * @param {JsonRecord} entities
 * @returns {string[]}
 */
/**
 * @param {JsonRecord} workflowDefinition
 * @param {JsonRecord} entities
 * @returns {string[]}
 */
/**
 * @param {WorkflowDefinition} workflowDefinition
 * @param {JsonRecord} entities
 * @returns {string[]}
 */
function getMissingFields(workflowDefinition, entities) {
  const requiredFields = workflowDefinition.steps.flatMap((step) => step.required_fields);
  return [...new Set(requiredFields)].filter((field) => !getString(entities[field]));
}

/**
 * @param {JsonRecord} workflowDefinition
 * @param {string[]} missingFields
 * @returns {string}
 */
/**
 * @param {JsonRecord} workflowDefinition
 * @param {string[]} missingFields
 * @returns {string}
 */
/**
 * @param {WorkflowDefinition} workflowDefinition
 * @param {string[]} missingFields
 * @returns {string}
 */
function getDefaultQuestion(workflowDefinition, missingFields) {
  if (missingFields.length === 0) {
    return 'I have enough details to continue. Please review before submitting.';
  }

  const matchingStep = workflowDefinition.steps.find((step) => step.required_fields.some((field) => missingFields.includes(field)));
  return matchingStep ? matchingStep.question : 'Please share one more detail so I can prepare this correctly.';
}

/**
 * @param {JsonRecord} workflowDefinition
 * @param {JsonRecord} entities
 * @param {string[]} missingFields
 * @param {string} nextQuestion
 * @returns {string}
 */
/**
 * @param {JsonRecord} workflowDefinition
 * @param {JsonRecord} entities
 * @param {string[]} missingFields
 * @param {string} nextQuestion
 * @returns {string}
 */
/**
 * @param {WorkflowDefinition} workflowDefinition
 * @param {JsonRecord} entities
 * @param {string[]} missingFields
 * @param {string} nextQuestion
 * @returns {string}
 */
function buildResponseText(workflowDefinition, entities, missingFields, nextQuestion) {
  if (missingFields.length === 0) {
    return `I understood this as ${workflowDefinition.name.toLowerCase()}. I can continue now.`;
  }

  return `I understood this as ${workflowDefinition.name.toLowerCase()}. ${nextQuestion}`;
}

/**
 * @param {JsonRecord} record
 * @returns {JsonRecord}
 */
/**
 * @param {JsonRecord} record
 * @returns {JsonRecord}
 */
function sanitizeRecord(record) {
  return Object.fromEntries(
    Object.entries(record)
      .filter(([key]) => /^[A-Za-z0-9_-]{1,64}$/.test(key))
      .map(([key, value]) => [key, sanitizeValue(value)])
  );
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
/**
 * @param {unknown} value
 * @returns {unknown}
 */
/**
 * @param {unknown} value
 * @returns {unknown}
 */
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
    return sanitizeRecord(/** @type {JsonRecord} */ (value));
  }

  return '';
}

/**
 * @param {string} value
 * @param {string[]} terms
 * @returns {boolean}
 */
function includesAny(value, terms) {
  return terms.some((term) => value.includes(term));
}



