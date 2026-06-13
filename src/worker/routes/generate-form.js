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
    ];
  }

  return [
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