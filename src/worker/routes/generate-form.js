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
    ];
  }

  return [
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
