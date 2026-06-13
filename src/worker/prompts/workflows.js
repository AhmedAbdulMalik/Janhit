// c:\Users\iyand\Downloads\Janhit\src\worker\prompts\workflows.js

/**
<<<<<<< HEAD
 * @typedef {{
 *   step: number,
 *   question: string,
 *   required_fields: string[]
 * }} WorkflowStep
 */

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   description: string,
 *   category: string,
 *   examples: string[],
 *   steps: WorkflowStep[]
 * }} WorkflowDefinition
 */

/** @type {Record<string, WorkflowDefinition>} */
=======
 * Workflow definitions and prompts for Janhit
 * Defines the conversational flow for each civic workflow
 */

>>>>>>> 8167d4cb47c82d4d99fa71bfda64dc2cd8d34b18
export const WORKFLOWS = {
  municipal_complaint: {
    id: 'municipal_complaint',
    name: 'Municipal Complaint',
    description: 'File complaints about municipal issues',
    category: 'Local Governance',
    examples: [
      'Broken streetlights',
      'Garbage collection issues',
      'Water supply complaints',
      'Road damage',
      'Drainage problems',
    ],
    steps: [
      {
        step: 1,
        question: 'What type of municipal issue are you facing?',
        required_fields: ['complaint_type'],
      },
      {
        step: 2,
        question: 'Please describe the issue in detail. Where is it located?',
        required_fields: ['location', 'description'],
      },
      {
        step: 3,
        question: 'What is your contact number for follow-up?',
        required_fields: ['contact_number'],
      },
    ],
  },
<<<<<<< HEAD
=======

>>>>>>> 8167d4cb47c82d4d99fa71bfda64dc2cd8d34b18
  banking_grievance: {
    id: 'banking_grievance',
    name: 'Banking Grievance',
    description: 'File complaints related to banking services',
    category: 'Financial Services',
    examples: [
      'Unauthorized transactions',
      'Failed refunds',
      'Double deductions',
      'Banking service complaints',
    ],
    steps: [
      {
        step: 1,
        question: 'Which bank do you have an account with?',
        required_fields: ['bank_name'],
      },
      {
        step: 2,
        question: 'What type of grievance are you experiencing?',
        required_fields: ['grievance_type'],
      },
      {
        step: 3,
        question: 'Please provide details about the issue',
        required_fields: ['description'],
      },
      {
        step: 4,
        question: 'How can we contact you for resolution?',
        required_fields: ['contact_number', 'email'],
      },
    ],
  },
};

<<<<<<< HEAD
=======
/**
 * System prompt for intent detection
 */
>>>>>>> 8167d4cb47c82d4d99fa71bfda64dc2cd8d34b18
export const INTENT_DETECTION_PROMPT = `You are Janhit, an AI civic assistant that helps citizens navigate government processes.

Analyze the user's input and determine:
1. The primary intent (which workflow they need)
2. Any entities mentioned (location, type, etc.)
3. Confidence level in your classification
<<<<<<< HEAD

Respond with JSON:
=======
4. The next spoken guidance sentence

Do not include hidden transcript text in the response. Keep responseText short, practical, and suitable for text-to-speech.

Respond with JSON only:
>>>>>>> 8167d4cb47c82d4d99fa71bfda64dc2cd8d34b18
{
  "intent": "workflow_id",
  "confidence": 0.0-1.0,
  "entities": {...},
<<<<<<< HEAD
  "clarification_needed": true/false
}`;

=======
  "clarification_needed": true/false,
  "nextQuestion": "question for missing detail or confirmation",
  "workflow": "workflow_id",
  "responseText": "spoken assistant response"
}`;

/**
 * System prompt for information collection
 */
>>>>>>> 8167d4cb47c82d4d99fa71bfda64dc2cd8d34b18
export const COLLECTION_PROMPT = `You are a helpful assistant collecting information for a civic complaint.

Based on the conversation context, ask for missing required information.
Be conversational and sympathetic to the user's concerns.
Keep responses concise and clear.`;

<<<<<<< HEAD
export const FORM_GENERATION_PROMPT = `You are an expert at generating formal complaint documents.

Using the collected information, generate a well-structured, professional complaint/application.
Include all necessary details and format it for submission.`;
=======
/**
 * System prompt for form generation
 */
export const FORM_GENERATION_PROMPT = `You are an expert at generating formal complaint documents.

Using the collected information, generate a well-structured, professional complaint/application.
Include all necessary details and format it for submission.`;
>>>>>>> 8167d4cb47c82d4d99fa71bfda64dc2cd8d34b18
