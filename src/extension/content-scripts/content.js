// /Users/ahmedabdulmalik/Documents/code/hackprix/Janhit/src/extension/content-scripts/content.js

/**
 * DOM-aware browser agent for Janhit.
 * Scans visible page controls, returns compact page context, and executes safe browser actions.
 */
/* global chrome */

const chromeRuntime = /** @type {any} */ (window).chrome?.runtime;

/**
 * @typedef {{
 *   action?: unknown,
 *   target?: unknown,
 *   data?: unknown,
 *   browserAction?: unknown,
 *   state?: unknown,
 *   result?: unknown,
 * }} ContentMessage
 * @typedef {{
 *   state: 'idle' | 'requesting-permission' | 'listening' | 'processing' | 'transcribing' | 'thinking' | 'speaking' | 'error',
 *   lastError?: string,
 * }} VoiceStateMessage
 * @typedef {{
 *   responseText?: string,
 *   browserAction?: unknown,
 *   domAction?: unknown,
 * }} AssistantResult
 */
const MAX_CONTEXT_ELEMENTS = 90;
const MAX_TEXT_LENGTH = 180;
const HIGHLIGHT_ID = 'janhit-element-highlight';
const HIGHLIGHT_LABEL_ID = 'janhit-element-highlight-label';
const DRAFT_ID = 'janhit-generated-draft';
const OVERLAY_ID = 'clicky-buddy-overlay';
const CURSOR_ID = 'clicky-buddy-cursor';
const BUBBLE_ID = 'clicky-buddy-bubble';

/** @type {Map<string, Element>} */
const elementRegistry = new Map();

/** @type {{ visible: boolean, state: string, text: string, targetRect: { x: number, y: number, width: number, height: number } | null, timeoutId: number | null }} */
const buddyState = {
  visible: false,
  state: 'idle',
  text: '',
  targetRect: null,
  timeoutId: null,
};

const VALID_VOICE_STATES = ['idle', 'requesting-permission', 'listening', 'processing', 'transcribing', 'thinking', 'speaking', 'error'];

/**
 * @param {unknown} value
 * @returns {value is VoiceStateMessage['state']}
 */
function isVoiceState(value) {
  return typeof value === 'string' && VALID_VOICE_STATES.includes(value);
}

console.log('Janhit content script loaded');

chromeRuntime?.onMessage.addListener(
  /**
   * @param {unknown} request
   * @param {unknown} _sender
   * @param {(response?: unknown) => void} sendResponse
   */
  (request, _sender, sendResponse) => {
    void handleContentMessage(request, sendResponse);
    return true;
  }
);

/**
 * @param {unknown} request
 * @param {(response?: unknown) => void} sendResponse
 */
async function handleContentMessage(request, sendResponse) {
  try {
    if (!request || typeof request !== 'object') {
      sendResponse({ success: false, error: 'Invalid content message' });
      return;
    }

    const message = /** @type {ContentMessage} */ (request);
    const action = typeof message.action === 'string' ? message.action : '';
    const target = typeof message.target === 'string' ? message.target : null;

    if (target && target !== 'content') {
      sendResponse({ success: false, error: 'Message was not targeted to content' });
      return;
    }

    if (action === 'get_page_context') {
        const ctx = getPageContext();
        console.debug('Janhit content: get_page_context ->', { url: ctx.url, title: ctx.title, elements: ctx.elements?.length });
        sendResponse({ success: true, context: ctx });
      return;
    }

    if (action === 'voice_capture_state_changed') {
      updateBuddyOverlayForState(/** @type {VoiceStateMessage} */ (message.state));
      sendResponse({ success: true });
      return;
    }

    if (action === 'assistant_response_ready') {
      updateBuddyOverlayForAssistant(/** @type {AssistantResult} */ (message.result));
      sendResponse({ success: true });
      return;
    }

    if (action === 'get_form_data') {
      sendResponse({ success: true, data: extractFormData() });
      return;
    }

    if (action === 'execute_browser_action') {
      console.debug('Janhit content: execute_browser_action received', message.browserAction);
      const result = await executeBrowserAction(message.browserAction);
      console.debug('Janhit content: execute_browser_action result', result);
      sendResponse({ success: true, result });
      return;
    }

    if (action === 'autofill_form') {
      const dataPayload = /** @type {{ fields?: unknown, draft?: unknown }} */ (typeof message.data === 'object' && message.data !== null ? message.data : {});
      const payloadSummary = {
        fields: Array.isArray(dataPayload.fields) ? dataPayload.fields.length : 0,
        draft: Boolean(dataPayload.draft),
      };
      console.debug('Janhit content: autofill_form data', payloadSummary);
      const result = autofillForm(message.data);
      console.debug('Janhit content: autofill_form result', result);
      sendResponse({ success: true, result });
      return;
    }

    sendResponse({ success: false, error: `Unknown content action: ${action}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected content script error';
    sendResponse({ success: false, error: message });
  }
}

/**
 * @returns {{
 *   url: string,
 *   title: string,
 *   language: string,
 *   viewport: { width: number, height: number, scrollX: number, scrollY: number },
 *   activeElementId: string | null,
 *   activeElementRect: { x: number, y: number, width: number, height: number } | null,
 *   elements: Array<Record<string, unknown>>,
 *   visibleText: string
 * }}
 */
function getPageContext() {
  elementRegistry.clear();

  const candidates = collectCandidateElements();
  const elements = candidates.slice(0, MAX_CONTEXT_ELEMENTS).map((element, index) => serializeElement(element, index));
  const activeElementId = document.activeElement instanceof Element ? getRegisteredElementId(document.activeElement) : null;

  return {
    url: window.location.href,
    title: document.title || '',
    language: document.documentElement.lang || navigator.language || 'en',
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    },
    activeElementId,
    activeElementRect: getActiveElementRect(),
    elements,
    visibleText: getVisiblePageText(),
  };
}

/**
 * @returns {Element[]}
 */
function collectCandidateElements() {
  const selector = [
    'input',
    'textarea',
    'select',
    'button',
    'a[href]',
    '[role="button"]',
    '[role="link"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="combobox"]',
    '[contenteditable="true"]',
    '[tabindex]',
  ].join(',');

  return Array.from(document.querySelectorAll(selector))
    .filter(isVisibleElement)
    .filter((element) => !isJanhitElement(element))
    .sort(compareElementsByScreenPosition);
}

/**
 * @param {Element} element
 * @param {number} index
 * @returns {Record<string, unknown>}
 */
function serializeElement(element, index) {
  const id = getRegisteredElementId(element, index);
  const rect = element.getBoundingClientRect();
  const tag = element.tagName.toLowerCase();
  const field = getFieldMetadata(element);
  const text = getElementText(element);
  const label = getElementLabel(element);
  const role = getElementRole(element);
  const selector = getElementSelector(element);

  return {
    id,
    tag,
    role,
    type: field.type,
    name: field.name,
    label,
    text,
    placeholder: field.placeholder,
    value: field.value,
    required: field.required,
    disabled: field.disabled,
    readonly: field.readonly,
    clickable: isClickableElement(element),
    editable: isEditableElement(element),
    options: getSelectOptions(element),
    selector,
    rect: {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
  };
}

/**
 * @param {unknown} rawAction
 * @returns {Promise<{ action: string, targetId: string | null, performed: boolean, message: string }>}
 */
async function executeBrowserAction(rawAction) {
  const browserAction = sanitizeBrowserAction(rawAction);
  console.debug('Janhit content: execute_browser_action received', browserAction);

  if (!browserAction || browserAction.type === 'none') {
    return {
      action: 'none',
      targetId: null,
      performed: false,
      message: 'No browser action requested',
    };
  }

  const element = resolveTargetElement(browserAction);

  if (!element) {
    console.debug('Janhit content: target element not found for', browserAction);
    return {
      action: browserAction.type,
      targetId: browserAction.targetId,
      performed: false,
      message: 'Target element was not found on the page',
    };
  }

  if (browserAction.type === 'highlight') {
    revealElement(element);
    drawHighlight(element, browserAction.label || 'Here');
    console.debug('Janhit content: highlight executed', browserAction.targetSelector || browserAction.targetId);
    return createActionResult(browserAction, true, 'Element highlighted');
  }

  if (browserAction.type === 'scroll_to') {
    revealElement(element);
    drawHighlight(element, browserAction.label || 'Here');
    console.debug('Janhit content: scroll executed', browserAction.targetSelector || browserAction.targetId);
    return createActionResult(browserAction, true, 'Scrolled to element');
  }

  if (browserAction.type === 'focus') {
    revealElement(element);
    focusElement(element);
    drawHighlight(element, browserAction.label || 'Focused here');
    console.debug('Janhit content: focus executed', browserAction.targetSelector || browserAction.targetId);
    return createActionResult(browserAction, true, 'Element focused');
  }

  if (browserAction.type === 'click') {
    revealElement(element);
    drawHighlight(element, browserAction.label || 'Clicking this');
    await delay(160);
    clickElement(element);
    console.debug('Janhit content: click executed', browserAction.targetSelector || browserAction.targetId);
    return createActionResult(browserAction, true, 'Element clicked');
  }

  if (browserAction.type === 'fill_field') {
    const value = typeof browserAction.value === 'string' ? browserAction.value : '';

    if (!value || !canSetValue(element)) {
      revealElement(element);
      drawHighlight(element, browserAction.label || 'This field needs input');
      console.debug('Janhit content: fill_field failed - no value or not editable', browserAction.targetSelector || browserAction.targetId);
      return createActionResult(browserAction, false, 'No fill value was provided or field is not editable');
    }

    setFieldValue(element, value);
    revealElement(element);
    drawHighlight(element, browserAction.label || 'Filled this field');
    console.debug('Janhit content: fill_field executed', browserAction.targetSelector || browserAction.targetId);
    return createActionResult(browserAction, true, 'Field filled');
  }

  console.debug('Janhit content: unsupported browser action', browserAction.type);
  return createActionResult(browserAction, false, `Unsupported browser action: ${browserAction.type}`);
}

/**
 * Extract visible text-like fields from the current page.
 * @returns {Record<string, { name: string, label: string, type: string, value: string }>}
 */
function extractFormData() {
  const fields = getFormFields();
  /** @type {Record<string, { name: string, label: string, type: string, value: string }> } */
  const formData = {};

  fields.forEach((field, index) => {
    formData[`field_${index}`] = {
      name: field.name,
      label: field.label,
      type: field.type,
      value: field.value,
    };
  });

  return formData;
}

/**
 * @param {unknown} rawData
 * @returns {{ filled: number, fields: string[] }}
 */
function autofillForm(rawData) {
  const data = sanitizeAutofillData(rawData);
  const fields = getFormFields();
  /** @type {string[]} */
  const filled = [];
  const valueMap = buildValueMap(data);

  fields.forEach((field, index) => {
    const normalizedName = normalizeKey(field.name);
    const normalizedLabel = normalizeKey(field.label);
    const value = valueMap[normalizedName] || valueMap[normalizedLabel] || valueMap[`field_${index}`];

    if (value && canSetValue(field.element)) {
      setFieldValue(field.element, value);
      filled.push(field.name || field.label || `field_${index}`);
    }
  });

  if (filled.length === 0 && data.draft) {
    appendDraftToPage(data.draft);
  }

  return {
    filled: filled.length,
    fields: filled,
  };
}

/**
 * @param {unknown} rawData
 * @returns {{ fields?: Array<{ name: string, label: string, type: string, value?: string }>, draft?: string, title?: string }}
 */
function sanitizeAutofillData(rawData) {
  if (!rawData || typeof rawData !== 'object') {
    return {};
  }

  const candidate = /** @type {{ form?: unknown, data?: unknown, draft?: unknown, title?: unknown }} */ (rawData);
  const form = sanitizeFormPayload(candidate.form);
  const draft = typeof candidate.draft === 'string' ? candidate.draft : form.draft;
  const title = typeof candidate.title === 'string' ? candidate.title : form.title;

  return {
    fields: form.fields,
    draft,
    title,
  };
}

/**
 * @param {unknown} rawForm
 * @returns {{ fields?: Array<{ name: string, label: string, type: string, value?: string }>, draft?: string, title?: string }}
 */
function sanitizeFormPayload(rawForm) {
  if (!rawForm || typeof rawForm !== 'object') {
    return {};
  }

  const candidate = /** @type {{ fields?: unknown, draft?: unknown, title?: unknown }} */ (rawForm);

  return {
    fields: Array.isArray(candidate.fields) ? candidate.fields.filter(isFormFieldDefinition) : [],
    draft: typeof candidate.draft === 'string' ? candidate.draft : '',
    title: typeof candidate.title === 'string' ? candidate.title : '',
  };
}

/**
 * @param {unknown} value
 * @returns {value is { name: string, label: string, type: string, value?: string }}
 */
function isFormFieldDefinition(value) {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = /** @type {{ name?: unknown, label?: unknown, type?: unknown }} */ (value);
  return typeof candidate.name === 'string' && typeof candidate.label === 'string' && typeof candidate.type === 'string';
}

/**
 * @param {{ fields?: Array<{ name: string, label: string, type: string, value?: string }> }} data
 * @returns {Record<string, string>}
 */
function buildValueMap(data) {
  const fields = Array.isArray(data.fields) ? data.fields : [];
  /** @type {Record<string, string>} */
  const values = {};

  fields.forEach((field, index) => {
    if (typeof field.value !== 'string' || !field.value.trim()) {
      return;
    }

    values[normalizeKey(field.name)] = field.value;
    values[normalizeKey(field.label)] = field.value;
    values[`field_${index}`] = field.value;
  });

  return values;
}

/**
 * @returns {Array<{ element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, name: string, label: string, type: string, value: string }>}
 */
function getFormFields() {
  return Array.from(document.querySelectorAll('input, textarea, select'))
    .filter((element) => element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)
    .filter(isUsableFormControl)
    .map((element) => ({
      element,
      name: getFieldName(element),
      label: getElementLabel(element),
      type: getFieldType(element),
      value: getFieldValue(element),
    }));
}

/**
 * @param {unknown} rawAction
 * @returns {{ type: string, targetId: string | null, targetSelector: string, value: string, label: string } | null}
 */
function sanitizeBrowserAction(rawAction) {
  if (!rawAction || typeof rawAction !== 'object') {
    return null;
  }

  const candidate = /** @type {{ type?: unknown, targetId?: unknown, target_id?: unknown, targetSelector?: unknown, selector?: unknown, value?: unknown, label?: unknown }} */ (rawAction);
  const type = typeof candidate.type === 'string' && candidate.type.trim() ? candidate.type.trim().toLowerCase() : 'none';
  const allowedTypes = ['none', 'highlight', 'scroll_to', 'focus', 'click', 'fill_field'];

  return {
    type: allowedTypes.includes(type) ? type : 'none',
    targetId: typeof candidate.targetId === 'string' && candidate.targetId.trim()
      ? candidate.targetId.trim()
      : typeof candidate.target_id === 'string' && candidate.target_id.trim()
        ? candidate.target_id.trim()
        : null,
    targetSelector: typeof candidate.targetSelector === 'string' && candidate.targetSelector.trim()
      ? candidate.targetSelector.trim()
      : typeof candidate.selector === 'string' && candidate.selector.trim()
        ? candidate.selector.trim()
        : '',
    value: typeof candidate.value === 'string' ? candidate.value.slice(0, 2000) : '',
    label: typeof candidate.label === 'string' ? candidate.label.slice(0, 120) : '',
  };
}

/**
 * @param {{ targetId: string | null, targetSelector: string }} action
 * @returns {Element | null}
 */
/**
 * @param {{ targetId: string | null, targetSelector: string } | null | undefined} action
 * @returns {Element | null}
 */
function resolveTargetElement(action) {
  if (!action) {
    return null;
  }

  if (action.targetId && elementRegistry.has(action.targetId)) {
    return elementRegistry.get(action.targetId) || null;
  }

  getPageContext();

  if (action.targetId && elementRegistry.has(action.targetId)) {
    return elementRegistry.get(action.targetId) || null;
  }

  if (action.targetSelector) {
    try {
      const element = document.querySelector(action.targetSelector);
      return element && isVisibleElement(element) ? element : null;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * @param {{ type: string, targetId: string | null }} action
 * @param {boolean} performed
 * @param {string} message
 * @returns {{ action: string, targetId: string | null, performed: boolean, message: string }}
 */
function createActionResult(action, performed, message) {
  return {
    action: action.type,
    targetId: action.targetId,
    performed,
    message,
  };
}

/**
 * @param {Element} element
 * @param {number} [fallbackIndex]
 * @returns {string}
 */
function getRegisteredElementId(element, fallbackIndex = 0) {
  for (const [id, registeredElement] of elementRegistry.entries()) {
    if (registeredElement === element) {
      return id;
    }
  }

  const explicitKey = [
    element.id ? `id-${element.id}` : '',
    getElementAttribute(element, 'name') ? `name-${getElementAttribute(element, 'name')}` : '',
    getElementAttribute(element, 'aria-label') ? `aria-${getElementAttribute(element, 'aria-label')}` : '',
    getElementText(element) ? `text-${getElementText(element)}` : '',
    String(fallbackIndex),
  ].filter(Boolean).join('-');
  const id = `el_${hashString(`${element.tagName}-${explicitKey}`).slice(0, 12)}`;
  elementRegistry.set(id, element);
  return id;
}

/**
 * @param {Element} element
 * @returns {{ type: string, name: string, placeholder: string, value: string, required: boolean, disabled: boolean, readonly: boolean }}
 */
function getFieldMetadata(element) {
  return {
    type: getFieldType(element),
    name: getFieldName(element),
    placeholder: getElementAttribute(element, 'placeholder'),
    value: getFieldValue(element),
    required: element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement ? element.required : element.hasAttribute('aria-required'),
    disabled: element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement ? element.disabled : element.getAttribute('aria-disabled') === 'true',
    readonly: element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element.readOnly : element.getAttribute('aria-readonly') === 'true',
  };
}

/**
 * @param {Element} element
 * @returns {string}
 */
function getFieldName(element) {
  return getElementAttribute(element, 'name') ||
    getElementAttribute(element, 'id') ||
    getElementAttribute(element, 'aria-label') ||
    getElementAttribute(element, 'placeholder') ||
    getElementText(element) ||
    element.tagName.toLowerCase();
}

/**
 * @param {Element} element
 * @returns {string}
 */
function getFieldType(element) {
  if (element instanceof HTMLInputElement) {
    return element.type || 'text';
  }

  if (element instanceof HTMLTextAreaElement) {
    return 'textarea';
  }

  if (element instanceof HTMLSelectElement) {
    return 'select';
  }

  return getElementAttribute(element, 'role') || element.tagName.toLowerCase();
}

/**
 * @param {Element} element
 * @returns {string}
 */
function getFieldValue(element) {
  if (element instanceof HTMLInputElement) {
    if (['password', 'file'].includes(element.type)) {
      return '';
    }

    if (['checkbox', 'radio'].includes(element.type)) {
      return element.checked ? 'checked' : '';
    }

    return sanitizeText(element.value, 120);
  }

  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    return sanitizeText(element.value, 160);
  }

  return '';
}

/**
 * @param {Element} element
 * @returns {string}
 */
function getElementLabel(element) {
  const explicitLabel = getElementAttribute(element, 'aria-label') || getElementAttribute(element, 'title');

  if (explicitLabel) {
    return explicitLabel;
  }

  const labelledBy = getElementAttribute(element, 'aria-labelledby');
  if (labelledBy) {
    const label = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent || '')
      .join(' ')
      .trim();

    if (label) {
      return sanitizeText(label);
    }
  }

  const id = getElementAttribute(element, 'id');
  if (id) {
    const label = document.querySelector(`label[for="${cssEscape(id)}"]`);
    if (label) {
      return sanitizeText(label.textContent || '');
    }
  }

  const parentLabel = element.closest('label');
  if (parentLabel) {
    return sanitizeText(parentLabel.textContent || '');
  }

  return getNearbyText(element);
}

/**
 * @param {Element} element
 * @returns {string}
 */
function getElementText(element) {
  if (element instanceof HTMLInputElement) {
    return sanitizeText(element.value || element.placeholder || element.getAttribute('aria-label') || '');
  }

  return sanitizeText(element.textContent || '');
}

/**
 * @param {Element} element
 * @returns {string}
 */
function getNearbyText(element) {
  const container = element.closest('div, section, article, form, fieldset, li, tr, p');

  if (!container) {
    return '';
  }

  const ownText = getElementText(element);
  const nearby = sanitizeText((container.textContent || '').replace(ownText, ''));
  return nearby;
}

/**
 * @param {Element} element
 * @returns {string}
 */
function getElementRole(element) {
  const explicitRole = getElementAttribute(element, 'role');

  if (explicitRole) {
    return explicitRole;
  }

  const tag = element.tagName.toLowerCase();

  if (tag === 'a') {
    return 'link';
  }

  if (tag === 'button') {
    return 'button';
  }

  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    return 'field';
  }

  return tag;
}

/**
 * @param {Element} element
 * @returns {string[]}
 */
function getSelectOptions(element) {
  if (!(element instanceof HTMLSelectElement)) {
    return [];
  }

  return Array.from(element.options)
    .slice(0, 25)
    .map((option) => sanitizeText(option.textContent || option.value, 80))
    .filter(Boolean);
}

/**
 * @param {Element} element
 * @returns {string}
 */
function getElementSelector(element) {
  if (!(element instanceof Element)) {
    return '';
  }

  if (element.id) {
    return `#${cssEscape(element.id)}`;
  }

  const path = [];
  let current = /** @type {Element | null} */ (element);

  while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.documentElement) {
    const tag = current.tagName.toLowerCase();
    let selector = tag;

    if (current.id) {
      selector += `#${cssEscape(current.id)}`;
      path.unshift(selector);
      break;
    }

    const className = current.className && typeof current.className === 'string'
      ? Array.from(current.classList).map(cssEscape).join('.')
      : '';

    if (className) {
      selector += `.${className}`;
    }

    const currentElement = current;
  const siblings = Array.from(currentElement.parentNode?.children || []).filter((child) => child.tagName === currentElement.tagName);
    if (siblings.length > 1) {
      const index = siblings.indexOf(currentElement) + 1;
      selector += `:nth-of-type(${index})`;
    }

    path.unshift(selector);
    current = current.parentElement;
  }

  return path.join(' > ');
}

/**
 * @param {Element} element
 * @returns {boolean}
 */
function isVisibleElement(element) {
  const rect = element.getBoundingClientRect();

  if (rect.width < 2 || rect.height < 2) {
    return false;
  }

  const style = window.getComputedStyle(element);

  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }

  return rect.bottom >= 0 && rect.right >= 0 && rect.top <= window.innerHeight && rect.left <= window.innerWidth;
}

/**
 * @param {Element} element
 * @returns {boolean}
 */
function isUsableFormControl(element) {
  if (!isVisibleElement(element)) {
    return false;
  }

  if (element instanceof HTMLInputElement && ['hidden', 'submit', 'button', 'reset', 'image', 'file', 'password'].includes(element.type)) {
    return false;
  }

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return !element.disabled && !element.readOnly;
  }

  if (element instanceof HTMLSelectElement) {
    return !element.disabled;
  }

  return false;
}

/**
 * @param {Element} element
 * @returns {boolean}
 */
function isClickableElement(element) {
  return element instanceof HTMLButtonElement ||
    element instanceof HTMLAnchorElement ||
    getElementAttribute(element, 'role') === 'button' ||
    getElementAttribute(element, 'role') === 'link' ||
    element.hasAttribute('onclick');
}

/**
 * @param {Element} element
 * @returns {boolean}
 */
function isEditableElement(element) {
  if (element instanceof HTMLTextAreaElement) {
    return !element.disabled && !element.readOnly;
  }

  if (element instanceof HTMLSelectElement) {
    return !element.disabled;
  }

  if (element instanceof HTMLInputElement) {
    return !element.disabled && !element.readOnly && !['hidden', 'button', 'submit', 'reset', 'image', 'file', 'password'].includes(element.type);
  }

  return element.getAttribute('contenteditable') === 'true';
}

/**
 * @param {Element} element
 * @returns {boolean}
 */
function canSetValue(element) {
  if (element instanceof HTMLInputElement) {
    return !element.disabled && !element.readOnly && !['checkbox', 'radio', 'hidden', 'submit', 'button', 'reset', 'image', 'file', 'password'].includes(element.type);
  }

  if (element instanceof HTMLTextAreaElement) {
    return !element.disabled && !element.readOnly;
  }

  if (element instanceof HTMLSelectElement) {
    return !element.disabled;
  }

  return element.getAttribute('contenteditable') === 'true';
}

/**
 * @param {Element} element
 * @param {string} value
 */
function setFieldValue(element, value) {
  if (element instanceof HTMLSelectElement) {
    const matchingOption = Array.from(element.options).find((option) => {
      const optionText = (option.textContent || '').trim().toLowerCase();
      const optionValue = option.value.trim().toLowerCase();
      const target = value.trim().toLowerCase();
      return optionText === target || optionValue === target || optionText.includes(target);
    });

    if (matchingOption) {
      element.value = matchingOption.value;
    }

    dispatchFieldEvents(element);
    return;
  }

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.focus();
    element.value = normalizeValueForElement(element, value);
    dispatchFieldEvents(element);
    return;
  }

  if (element.getAttribute('contenteditable') === 'true') {
    element.textContent = value;
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
  }
}

/**
 * @param {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} element
 * @param {string} value
 * @returns {string}
 */
function normalizeValueForElement(element, value) {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    return value;
  }

  if (element.type === 'email') {
    return value.trim();
  }

  if (element.type === 'tel') {
    return value.replace(/[^\d+\-\s()]/g, '');
  }

  if (element.type === 'url') {
    return value.trim();
  }

  return value;
}

/**
 * @param {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} element
 */
function dispatchFieldEvents(element) {
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * @param {Element} element
 */
function revealElement(element) {
  element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
}

/**
 * @param {Element} element
 */
function focusElement(element) {
  if (element instanceof HTMLElement) {
    element.focus({ preventScroll: true });
  }
}

/**
 * @param {Element} element
 */
function clickElement(element) {
  if (element instanceof HTMLElement) {
    element.click();
    return;
  }

  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
}

/**
 * @param {Element} element
 * @param {string} label
 */
function drawHighlight(element, label) {
  removeHighlight();

  const rect = element.getBoundingClientRect();
  const overlay = document.createElement('div');
  overlay.id = HIGHLIGHT_ID;
  overlay.style.cssText = [
    'position:fixed',
    `left:${Math.max(0, rect.left - 6)}px`,
    `top:${Math.max(0, rect.top - 6)}px`,
    `width:${Math.max(8, rect.width + 12)}px`,
    `height:${Math.max(8, rect.height + 12)}px`,
    'z-index:2147483647',
    'border:3px solid #0ea5e9',
    'box-shadow:0 0 0 6px rgba(14,165,233,.22),0 12px 32px rgba(15,23,42,.18)',
    'border-radius:8px',
    'pointer-events:none',
    'box-sizing:border-box',
    'transition:opacity .2s ease',
  ].join(';');

  const labelElement = document.createElement('div');
  labelElement.id = HIGHLIGHT_LABEL_ID;
  labelElement.textContent = label || 'Here';
  labelElement.style.cssText = [
    'position:fixed',
    `left:${Math.max(8, rect.left)}px`,
    `top:${Math.max(8, rect.top - 36)}px`,
    'z-index:2147483647',
    'max-width:min(360px,calc(100vw - 16px))',
    'padding:7px 10px',
    'border-radius:8px',
    'background:#0f172a',
    'color:#ffffff',
    'font:600 13px/1.3 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    'box-shadow:0 8px 24px rgba(15,23,42,.24)',
    'pointer-events:none',
  ].join(';');

  document.documentElement.append(overlay, labelElement);
  window.setTimeout(removeHighlight, 8000);
}

function removeHighlight() {
  document.getElementById(HIGHLIGHT_ID)?.remove();
  document.getElementById(HIGHLIGHT_LABEL_ID)?.remove();
}

function getActiveElementRect() {
  const active = document.activeElement;
  if (!(active instanceof Element)) {
    return null;
  }

  try {
    const rect = active.getBoundingClientRect();
    return {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  } catch {
    return null;
  }
}

function ensureBuddyOverlay() {
  if (document.getElementById(OVERLAY_ID)) {
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    'width:100vw',
    'height:100vh',
    'pointer-events:none',
    'z-index:2147483646',
  ].join(';');

  const cursor = document.createElement('div');
  cursor.id = CURSOR_ID;
  cursor.style.cssText = [
    'position:absolute',
    'width:0',
    'height:0',
    'border-left:16px solid transparent',
    'border-right:16px solid transparent',
    'border-bottom:24px solid rgba(14,165,233,0.95)',
    'filter:drop-shadow(0 10px 24px rgba(14,165,233,0.35))',
    'transform:translate(-50%, -100%) scale(1)',
    'transition:transform 220ms ease, left 220ms ease, top 220ms ease',
    'pointer-events:none',
  ].join(';');

  const bubble = document.createElement('div');
  bubble.id = BUBBLE_ID;
  bubble.style.cssText = [
    'position:absolute',
    'min-width:220px',
    'max-width:320px',
    'padding:12px 14px',
    'border-radius:18px',
    'background:rgba(15,23,42,0.9)',
    'color:#ffffff',
    'font:400 13px/1.5 system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif',
    'box-shadow:0 20px 40px rgba(15,23,42,0.24)',
    'backdrop-filter:blur(8px)',
    'transform:translate(-50%, -130%)',
    'transition:opacity 180ms ease, transform 180ms ease',
    'opacity:0',
    'pointer-events:none',
    'white-space:pre-wrap',
    'word-break:break-word',
    'line-height:1.4',
  ].join(';');
  bubble.textContent = '';

  overlay.append(cursor, bubble);
  document.body.appendChild(overlay);
}

/**
 * @param {string} text
 * @param {'idle'|'requesting-permission'|'listening'|'processing'|'transcribing'|'thinking'|'speaking'|'error'} state
 * @param {{ x: number, y: number, width: number, height: number } | null} targetRect
 */
function setBuddyOverlay(text, state, targetRect) {
  ensureBuddyOverlay();
  const overlay = document.getElementById(OVERLAY_ID);
  const cursor = document.getElementById(CURSOR_ID);
  const bubble = document.getElementById(BUBBLE_ID);

  if (!overlay || !cursor || !bubble) {
    return;
  }

  buddyState.visible = true;
  buddyState.state = state || 'idle';
  buddyState.text = text || '';
  buddyState.targetRect = targetRect || null;

  const safeText = text && typeof text === 'string' ? text.trim() : '';
  bubble.textContent = safeText || getStateLabel(state);
  bubble.style.opacity = '1';

  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
  };

  let left = viewport.width * 0.5;
  let top = viewport.height * 0.2;

  if (targetRect && typeof targetRect === 'object') {
    left = targetRect.x + Math.max(16, targetRect.width / 2);
    top = targetRect.y - 14;
    if (top < 72) {
      top = targetRect.y + targetRect.height + 28;
    }
  }

  cursor.style.left = `${Math.min(Math.max(16, left), viewport.width - 16)}px`;
  cursor.style.top = `${Math.min(Math.max(32, top), viewport.height - 32)}px`;
  bubble.style.left = cursor.style.left;
  bubble.style.top = `${Math.max(30, parseFloat(cursor.style.top) - 18)}px`;

  if (buddyState.timeoutId) {
    window.clearTimeout(buddyState.timeoutId);
    buddyState.timeoutId = null;
  }

  if (state === 'idle') {
    buddyState.timeoutId = window.setTimeout(() => {
      hideBuddyOverlay();
    }, 2500);
  }
}

/**
 * @param {'idle'|'requesting-permission'|'listening'|'processing'|'transcribing'|'thinking'|'speaking'|'error'} state
 */
function getStateLabel(state) {
  if (state === 'listening') return 'Listeningâ€¦';
  if (state === 'processing') return 'Processingâ€¦';
  if (state === 'transcribing') return 'Transcribingâ€¦';
  if (state === 'thinking') return 'Thinkingâ€¦';
  if (state === 'speaking') return 'Speakingâ€¦';
  if (state === 'error') return 'Oops, something went wrong.';
  return 'Clicky Buddy is ready.';
}

function hideBuddyOverlay() {
  const overlay = document.getElementById(OVERLAY_ID);
  const bubble = document.getElementById(BUBBLE_ID);
  if (bubble) {
    bubble.style.opacity = '0';
  }
  if (overlay) {
    overlay.style.pointerEvents = 'none';
  }
  buddyState.visible = false;
}

/**
 * @param {VoiceStateMessage | null | undefined} state
 */
function updateBuddyOverlayForState(state) {
  if (!state || typeof state !== 'object') {
    return;
  }

  const candidate = /** @type {{ state?: unknown, lastError?: unknown }} */ (state);
  const nextState = isVoiceState(candidate.state) ? /** @type {VoiceStateMessage['state']} */ (candidate.state) : 'idle';
  const label = typeof candidate.lastError === 'string' && candidate.lastError ? candidate.lastError : getStateLabel(nextState);
  setBuddyOverlay(label, nextState, buddyState.targetRect);
}

/**
 * @param {AssistantResult | null | undefined} result
 */
function updateBuddyOverlayForAssistant(result) {
  if (!result || typeof result !== 'object') {
    return;
  }

  const candidate = /** @type {{ responseText?: unknown, browserAction?: unknown, domAction?: unknown }} */ (result);
  const responseText = typeof candidate.responseText === 'string' ? candidate.responseText : '';
  const action = candidate.domAction || candidate.browserAction || null;
  let targetRect = null;

  if (action && typeof action === 'object') {
    const browserAction = sanitizeBrowserAction(action);
    const element = resolveTargetElement(browserAction);
    if (element) {
      try {
        const rect = element.getBoundingClientRect();
        targetRect = {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      } catch {
        targetRect = null;
      }
    }
  }

  if (targetRect) {
    setBuddyOverlay(responseText || getStateLabel('speaking'), 'speaking', targetRect);
    const safeAction = sanitizeBrowserAction(action);
    const highlightTarget = resolveTargetElement(safeAction) || document.body;
    drawHighlight(highlightTarget, safeAction?.label || 'Target');
  } else {
    setBuddyOverlay(responseText || 'Found it.', 'speaking', null);
  }
}

/**
 * @param {string} draft
 */
function appendDraftToPage(draft) {
  document.getElementById(DRAFT_ID)?.remove();

  const container = document.createElement('div');
  container.id = DRAFT_ID;
  container.style.cssText = [
    'position:fixed',
    'right:16px',
    'bottom:16px',
    'z-index:2147483647',
    'width:min(420px,calc(100vw - 32px))',
    'max-height:55vh',
    'overflow:auto',
    'padding:16px',
    'border-radius:8px',
    'background:#ffffff',
    'box-shadow:0 16px 40px rgba(15,23,42,.22)',
    'border:1px solid rgba(15,23,42,.12)',
    'font-family:Arial,sans-serif',
    'font-size:14px',
    'line-height:1.5',
    'color:#1f2937',
    'white-space:pre-wrap',
  ].join(';');
  container.textContent = draft;

  document.body.appendChild(container);
}

/**
 * @returns {string}
 */
function getVisiblePageText() {
  const text = sanitizeText(document.body?.innerText || '', 1200);
  return text;
}

/**
 * @param {Element} element
 * @returns {boolean}
 */
function isJanhitElement(element) {
  return element.id === HIGHLIGHT_ID || element.id === HIGHLIGHT_LABEL_ID || element.id === DRAFT_ID || element.id === OVERLAY_ID || element.id === CURSOR_ID || element.id === BUBBLE_ID || Boolean(element.closest(`#${HIGHLIGHT_ID}, #${HIGHLIGHT_LABEL_ID}, #${DRAFT_ID}, #${OVERLAY_ID}`));
}

/**
 * @param {Element} first
 * @param {Element} second
 * @returns {number}
 */
function compareElementsByScreenPosition(first, second) {
  const firstRect = first.getBoundingClientRect();
  const secondRect = second.getBoundingClientRect();
  return firstRect.top === secondRect.top ? firstRect.left - secondRect.left : firstRect.top - secondRect.top;
}

/**
 * @param {Element} element
 * @param {string} name
 * @returns {string}
 */
function getElementAttribute(element, name) {
  return sanitizeText(element.getAttribute(name) || '', 160);
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeKey(value) {
  return sanitizeText(value, 120).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/**
 * @param {string} value
 * @param {number} [maxLength]
 * @returns {string}
 */
function sanitizeText(value, maxLength = MAX_TEXT_LENGTH) {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

/**
 * @param {string} value
 * @returns {string}
 */
function hashString(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }

  return Math.abs(hash >>> 0).toString(36);
}

/**
 * @param {string} value
 * @returns {string}
 */
function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === 'function') {
    return window.CSS.escape(value);
  }

  return value.replace(/["\\]/g, '\\$&');
}

/**
 * @param {number} milliseconds
 * @returns {Promise<void>}
 */
function delay(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

