// /Users/ahmedabdulmalik/Documents/code/hackprix/Janhit/src/worker/routes/voice-assist.js

import { createJsonResponse, getString } from '../lib/http.js';
import { generateFormDraft } from './generate-form.js';
import { processTranscript } from './process.js';
import { synthesizeText } from './synthesize.js';
import { transcribeFormData } from './transcribe.js';

export async function handleVoiceAssist(request, env) {
  try {
    const formData = await request.formData();
    const context = parseContext(formData.get('context'));
    const transcription = await transcribeFormData(formData, env);
    const processed = await processTranscript(transcription.transcript, context, env);
    const responseText = getString(processed.responseText, getString(processed.nextQuestion, 'I can help with this. Please share a little more detail.'));
    const form = processed.intent ? generateFormDraft(processed.intent, processed.entities || {}) : null;
    const audio = await synthesizeText(responseText, transcription.language, env);
    const includeTranscript = getString(env.DEBUG_TRANSCRIPTS).toLowerCase() === 'true';

    return createJsonResponse({
      success: true,
      language: transcription.language,
      intent: processed.intent,
      workflow: processed.workflow,
      confidence: processed.confidence,
      responseText,
      browserAction: processed.browserAction || null,
      domAction: processed.domAction || null,
      audio_url: audio.audioUrl,
      audio_mime_type: audio.mimeType,
      data: {
        intent: processed.intent,
        workflow: processed.workflow,
        confidence: processed.confidence,
        entities: processed.entities,
        nextQuestion: processed.nextQuestion,
        responseText,
        missingFields: processed.missingFields,
        browserAction: processed.browserAction || null,
        domAction: processed.domAction || null,
      },
      form,
      transcript: includeTranscript ? transcription.transcript : undefined,
    });
  } catch (error) {
    return createJsonResponse({
      success: false,
      error: 'Voice assistant failed',
      message: error instanceof Error ? error.message : 'Unexpected voice assistant error',
    }, 500);
  }
}

function parseContext(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
