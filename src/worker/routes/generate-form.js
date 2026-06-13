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
  const workflow = WORKFLOWS[intent] || { name: 'General Request', category: 'General' };
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
  return [
    { name: 'title', label: 'Title', type: 'text', required: false },
    { name: 'description', label: 'Description', type: 'textarea', required: true },
    { name: 'url', label: 'URL', type: 'text', required: false },
  ];
}

function createDraft(intent, data) {
  return [
    'Subject: General assistance request',
    '',
    `Title: ${getString(data.title, 'Not provided')}`,
    '',
    'Details:',
    getString(data.description, 'The user has requested help with the current page.'),
    '',
    `URL: ${getString(data.url, 'Not provided')}`,
    '',
    'I request assistance based on the user’s current page and transcript.',
  ].join('\n');
}

function normalizeIntent(intent) {
  return intent || 'general';
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
