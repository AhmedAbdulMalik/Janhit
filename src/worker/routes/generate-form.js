<<<<<<< HEAD
// c:\Users\iyand\Downloads\Janhit\src\worker\routes\generate-form.js

import { WORKFLOWS } from '../prompts/workflows.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, api-key',
};

/**
 * @typedef {{
 *   intent: string,
 *   data?: Record<string, unknown>
 * }} GenerateFormRequestBody
 */

/**
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function handleGenerateForm(request) {
  try {
    const body = /** @type {GenerateFormRequestBody} */ (await request.json());
    const intent = normalizeString(body.intent);

    if (!intent) {
      return jsonResponse(
        {
          success: false,
          error: 'Bad request',
          message: 'No intent provided',
        },
        400
      );
    }

    const workflow = WORKFLOWS[intent] || WORKFLOWS.municipal_complaint;
    const collected = isRecord(body.data) ? body.data : {};
    const form = buildFormDraft(workflow, collected);

    return jsonResponse(
      {
        success: true,
        form,
        message: 'Form draft generated successfully',
      },
      200
    );
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: 'Form generation failed',
        message: error instanceof Error ? error.message : 'Unexpected form generation error',
      },
      500
    );
  }
}

/**
 * @param {{ id: string, name: string, description: string, examples: string[], steps: Array<{ required_fields: string[] }> }} workflow
 * @param {Record<string, unknown>} data
 */
function buildFormDraft(workflow, data) {
  const fields = inferFields(workflow.id, data);
  const draft = buildDraftText(workflow, data);

  return {
    title: `${workflow.name} Form`,
    workflow: workflow.id,
    description: workflow.description,
    fields,
    draft,
  };
}

/**
 * @param {string} workflowId
 * @param {Record<string, unknown>} data
 */
function inferFields(workflowId, data) {
  if (workflowId === 'banking_grievance') {
    return [
      createField('bank_name', 'Bank Name', 'text', getValue(data, 'bank_name')),
      createField('account_number', 'Account Number', 'text', getValue(data, 'account_number')),
      createField('grievance_type', 'Type of Grievance', 'select', getValue(data, 'grievance_type')),
      createField('description', 'Detailed Description', 'textarea', getValue(data, 'description')),
      createField('contact_number', 'Contact Number', 'tel', getValue(data, 'contact_number')),
=======
// /Users/ahmedabdulmalik/Documents/code/hackprix/Janhit/src/worker/routes/generate-form.js

import { createJsonResponse, getString, readJsonBody } from '../lib/http.js';
import { WORKFLOWS } from '../prompts/workflows.js';

export async function handleGenerateForm(request) {
  try {
    const body = await readJsonBody(request);
    const intent = normalizeIntent(getString(body.intent));
    const data = body.data && typeof body.data === 'object' && !Array.isArray(body.data)
      ? sanitizeData(body.data)
      : {};
    const formDraft = generateFormDraft(intent, data);

    return createJsonResponse({
      success: true,
      form: formDraft,
      message: 'Form draft generated successfully',
    });
  } catch (error) {
    return createJsonResponse({
      success: false,
      error: 'Form generation failed',
      message: error instanceof Error ? error.message : 'Unexpected form generation error',
    }, 500);
  }
}

export function generateFormDraft(intent, data) {
  const workflow = WORKFLOWS[intent] || WORKFLOWS.municipal_complaint;
  const fields = getFieldsForIntent(intent);
  const values = Object.fromEntries(fields.map((field) => [field.name, getString(data[field.name])]));
  const missingFields = fields.filter((field) => field.required && !values[field.name]).map((field) => field.name);

  return {
    id: intent,
    title: workflow.name,
    category: workflow.category,
    fields: fields.map((field) => ({
      ...field,
      value: values[field.name] || '',
    })),
    missingFields,
    draft: createDraft(intent, data),
    autofill: values,
  };
}

function getFieldsForIntent(intent) {
  if (intent === 'banking_grievance') {
    return [
      { name: 'bank_name', label: 'Bank Name', type: 'text', required: true },
      { name: 'account_number', label: 'Account Number', type: 'text', required: false },
      { name: 'grievance_type', label: 'Type of Grievance', type: 'select', required: true, options: ['unauthorized_transaction', 'failed_refund', 'double_deduction', 'service_issue'] },
      { name: 'description', label: 'Detailed Description', type: 'textarea', required: true },
      { name: 'contact_number', label: 'Contact Number', type: 'tel', required: true },
      { name: 'email', label: 'Email', type: 'email', required: true },
>>>>>>> 8167d4cb47c82d4d99fa71bfda64dc2cd8d34b18
    ];
  }

  return [
<<<<<<< HEAD
    createField('complaint_type', 'Type of Complaint', 'select', getValue(data, 'complaint_type')),
    createField('location', 'Location / Address', 'text', getValue(data, 'location')),
    createField('description', 'Detailed Description', 'textarea', getValue(data, 'description')),
    createField('contact_number', 'Contact Number', 'tel', getValue(data, 'contact_number')),
  ];
}

/**
 * @param {{ name: string, description: string, examples: string[] }} workflow
 * @param {Record<string, unknown>} data
 */
function buildDraftText(workflow, data) {
  const issue = normalizeString(getValue(data, 'description')) || workflow.description;
  const location = normalizeString(getValue(data, 'location'));
  const contactNumber = normalizeString(getValue(data, 'contact_number'));
  const bankName = normalizeString(getValue(data, 'bank_name'));

  const lines = [
    `${workflow.name}`,
    '',
    `Subject: ${workflow.description}`,
    '',
    `I am writing to report the following issue: ${issue}.`,
  ];

  if (location) {
    lines.push(`Location: ${location}.`);
  }

  if (bankName) {
    lines.push(`Bank: ${bankName}.`);
  }

  if (contactNumber) {
    lines.push(`Contact: ${contactNumber}.`);
  }

  lines.push('', 'I request prompt action and a written confirmation of the resolution timeline.');

  return lines.join('\n');
}

/**
 * @param {string} name
 * @param {string} label
 * @param {string} type
 * @param {string} value
 */
function createField(name, label, type, value) {
  return { name, label, type, value };
}

/**
 * @param {Record<string, unknown>} data
 * @param {string} key
 * @returns {string}
 */
function getValue(data, key) {
  const value = data[key];
  return typeof value === 'string' ? value : '';
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
    { name: 'complaint_type', label: 'Type of Complaint', type: 'select', required: true, options: ['broken_streetlight', 'garbage_collection', 'water_supply', 'road_damage', 'drainage'] },
    { name: 'location', label: 'Location/Address', type: 'text', required: true },
    { name: 'description', label: 'Detailed Description', type: 'textarea', required: true },
    { name: 'contact_number', label: 'Contact Number', type: 'tel', required: true },
  ];
}

function createDraft(intent, data) {
  if (intent === 'banking_grievance') {
    return [
      'Subject: Banking grievance request',
      '',
      `Bank: ${getString(data.bank_name, 'Not provided')}`,
      `Grievance Type: ${formatValue(data.grievance_type)}`,
      `Account Reference: ${maskAccountNumber(getString(data.account_number, 'Not provided'))}`,
      '',
      'Details:',
      getString(data.description, 'The complainant has requested assistance with a banking grievance.'),
      '',
      `Contact Number: ${getString(data.contact_number, 'Not provided')}`,
      `Email: ${getString(data.email, 'Not provided')}`,
      '',
      'I request the concerned authority to review this matter and provide a written resolution at the earliest.',
    ].join('\n');
  }

  return [
    'Subject: Municipal complaint request',
    '',
    `Complaint Type: ${formatValue(data.complaint_type)}`,
    `Location: ${getString(data.location, 'Not provided')}`,
    '',
    'Details:',
    getString(data.description, 'The complainant has requested assistance with a municipal issue.'),
    '',
    `Contact Number: ${getString(data.contact_number, 'Not provided')}`,
    '',
    'I request the concerned municipal authority to inspect the location and resolve this issue as soon as possible.',
  ].join('\n');
}

function normalizeIntent(intent) {
  return WORKFLOWS[intent] ? intent : 'municipal_complaint';
}

function sanitizeData(data) {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([key]) => /^[A-Za-z0-9_-]{1,64}$/.test(key))
      .map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 2000).trim() : value])
  );
}

function formatValue(value) {
  return getString(value, 'Not provided').replaceAll('_', ' ');
}

function maskAccountNumber(accountNumber) {
  if (!accountNumber || accountNumber === 'Not provided') {
    return 'Not provided';
  }

  const visibleDigits = accountNumber.replace(/\D/g, '').slice(-4);
  return visibleDigits ? `Ending in ${visibleDigits}` : 'Provided';
}
>>>>>>> 8167d4cb47c82d4d99fa71bfda64dc2cd8d34b18
