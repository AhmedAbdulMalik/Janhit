// c:\Users\iyand\Downloads\Janhit\src\extension\content-scripts\content.js

/**
 * Lightweight DOM form extraction and autofill for Janhit.
 * Uses native field indicators and dispatches input/change events for React/Vue compatibility.
 */

/**
 * @typedef {{
 *   name: string,
 *   label: string,
 *   type: string,
 *   value?: string,
 *   options?: string[]
 * }} FormFieldDefinition
 */

/**
 * @typedef {{
 *   fields?: FormFieldDefinition[],
 *   draft?: string,
 *   title?: string
 * }} FormPayload
 */

/**
 * @typedef {{
 *   intent?: string | null,
 *   workflow?: string | null,
 *   responseText?: string,
 *   language?: string,
 *   confidence?: number | null
 * }} AssistantResult
 */

/**
 * @typedef {{
 *   fields?: FormFieldDefinition[],
 *   draft?: string,
 *   title?: string
 * }} AutofillData
 */

console.log('Janhit content script loaded');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    if (!request || typeof request.action !== 'string') {
      sendResponse({ success: false, error: 'Invalid content message' });
      return;
    }

    if (request.target && request.target !== 'content') {
      return;
    }

    if (request.action === 'autofill_form') {
      const result = autofillForm(request.data);
      sendResponse({ success: true, result });
      return;
    }

    if (request.action === 'get_form_data') {
      sendResponse({ success: true, data: extractFormData() });
      return;
    }

    sendResponse({ success: false, error: `Unknown content action: ${request.action}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected content script error';
    sendResponse({ success: false, error: message });
  }

  return true;
});

/**
 * Extract visible text-like fields from the current page.
 * @returns {Record<string, { name: string, label: string, type: string, value: string }>}
 */
function extractFormData() {
  const fields = getFormFields();
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
 * Autofill fields using workflow metadata and extracted form structure.
 * @param {unknown} rawData
 * @returns {{ filled: number, fields: string[] }}
 */
function autofillForm(rawData) {
  const data = sanitizeAutofillData(rawData);
  const fields = getFormFields();
  const filled = [];
  const valueMap = buildValueMap(data);

  fields.forEach((field, index) => {
    const value = valueMap[field.name] || valueMap[field.label] || valueMap[`field_${index}`];

    if (value && canSetValue(field.element, value)) {
      setFieldValue(field.element, value);
      filled.push(field.name);
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
 * @returns {AutofillData}
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
 * @returns {FormPayload}
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
 * @returns {value is FormFieldDefinition}
 */
function isFormFieldDefinition(value) {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = /** @type {{ name?: unknown, label?: unknown, type?: unknown, options?: unknown }} */ (value);

  return typeof candidate.name === 'string' && typeof candidate.label === 'string' && typeof candidate.type === 'string';
}

/**
 * @param {AutofillData} data
 * @returns {Record<string, string>}
 */
function buildValueMap(data) {
  const fields = data.fields || [];
  const values = {
    complaint_type: '',
    location: '',
    description: '',
    contact_number: '',
    bank_name: '',
    account_number: '',
    grievance_type: '',
    email: '',
  };

  fields.forEach((field) => {
    if (typeof field.value === 'string') {
      values[field.name] = field.value;
    }
  });

  return values;
}

/**
 * @returns {Array<{ element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, name: string, label: string, type: string }>}
 */
function getFormFields() {
  return Array.from(document.querySelectorAll('input, textarea, select'))
    .filter(isVisibleFormControl)
    .filter((element) => element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)
    .map((element) => ({
      element,
      name: getFieldName(element),
      label: getFieldLabel(element),
      type: element.type || element.tagName.toLowerCase(),
    }));
}

/**
 * @param {Element} element
 * @returns {element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement}
 */
function isVisibleFormControl(element) {
  if (element instanceof HTMLInputElement && ['hidden', 'submit', 'button', 'reset', 'image'].includes(element.type)) {
    return false;
  }

  if (element.hasAttribute('readonly') || element.hasAttribute('disabled')) {
    return false;
  }

  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

/**
 * @param {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} element
 * @returns {string}
 */
function getFieldName(element) {
  return element.name || element.id || element.getAttribute('aria-label') || element.getAttribute('placeholder') || element.type || 'field';
}

/**
 * @param {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} element
 * @returns {string}
 */
function getFieldLabel(element) {
  const explicitLabel = element.getAttribute('aria-label') || element.getAttribute('placeholder') || element.getAttribute('title');

  if (explicitLabel) {
    return explicitLabel;
  }

  const id = element.id;

  if (id) {
    const label = document.querySelector(`label[for="${cssEscape(id)}"]`);

    if (label) {
      return label.textContent?.trim() || '';
    }
  }

  return '';
}

/**
 * @param {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} element
 * @param {string} value
 */
function setFieldValue(element, value) {
  const targetValue = normalizeValueForElement(element, value);

  if (element instanceof HTMLSelectElement) {
    const matchingOption = Array.from(element.options).find((option) => option.value === targetValue || option.textContent.trim() === value);

    if (matchingOption) {
      element.value = matchingOption.value;
    }

    return;
  }

  element.value = targetValue;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * @param {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} element
 * @param {string} value
 * @returns {boolean}
 */
function canSetValue(element, value) {
  if (element instanceof HTMLInputElement) {
    if (['checkbox', 'radio'].includes(element.type)) {
      return false;
    }

    if (['email', 'tel', 'text', 'search', 'url'].includes(element.type)) {
      return true;
    }

    return element.type === '' || value.trim().length > 0;
  }

  return true;
}

/**
 * @param {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} element
 * @param {string} value
 * @returns {string}
 */
function normalizeValueForElement(element, value) {
  if (element instanceof HTMLTextAreaElement) {
    return value;
  }

  if (element instanceof HTMLSelectElement) {
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
 * @param {string} draft
 */
function appendDraftToPage(draft) {
  const container = document.createElement('div');
  container.id = 'janhit-generated-draft';
  container.style.cssText = [
    'position:fixed',
    'right:16px',
    'bottom:16px',
    'z-index:2147483647',
    'width:min(420px,calc(100vw - 32px))',
    'max-height:55vh',
    'overflow:auto',
    'padding:16px',
    'border-radius:16px',
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
 * @param {string} value
 * @returns {string}
 */
function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === 'function') {
    return window.CSS.escape(value);
  }

  return value.replace(/["\\]/g, '\\$&');
}

