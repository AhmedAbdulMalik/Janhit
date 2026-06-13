// c:\Users\iyand\Downloads\Janhit\src\worker\routes\generate-form.js

/**
 * Form generation endpoint
 * Generates structured complaint/application drafts
 */

export async function handleGenerateForm(request, env) {
  try {
    const { intent, data = {} } = await request.json();

    if (!intent) {
      return new Response(JSON.stringify({ error: 'No intent provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // TODO: Generate form based on intent and collected data
    const formDraft = generateFormDraft(intent, data);

    return new Response(
      JSON.stringify({
        success: true,
        form: formDraft,
        message: 'Form draft generated successfully',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Form generation failed',
        message: error.message,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * Generate form draft based on workflow intent
 */
function generateFormDraft(intent, data) {
  const templates = {
    municipal_complaint: {
      title: 'Municipal Complaint Form',
      fields: [
        { name: 'complaint_type', label: 'Type of Complaint', type: 'select' },
        { name: 'location', label: 'Location/Address', type: 'text' },
        { name: 'description', label: 'Detailed Description', type: 'textarea' },
        { name: 'contact_number', label: 'Contact Number', type: 'tel' },
      ],
    },
    banking_grievance: {
      title: 'Banking Grievance Form',
      fields: [
        { name: 'bank_name', label: 'Bank Name', type: 'text' },
        { name: 'account_number', label: 'Account Number', type: 'text' },
        { name: 'grievance_type', label: 'Type of Grievance', type: 'select' },
        { name: 'description', label: 'Detailed Description', type: 'textarea' },
      ],
    },
  };

  return templates[intent] || templates.municipal_complaint;
}
