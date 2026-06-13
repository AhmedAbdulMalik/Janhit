// c:\Users\iyand\Downloads\Janhit\src\extension\background\service-worker.js

import { JanhitAPI } from '../utils/api.js';

const OFFSCREEN_DOCUMENT_PATH = 'offscreen/index.html';

/**
 * @typedef {'idle' | 'requesting-permission' | 'listening' | 'processing' | 'transcribing' | 'thinking' | 'speaking' | 'error'} VoiceCaptureState
 */

/**
 * @typedef {{
 *   mimeType: string,
 *   durationMs: number,
 *   sizeBytes: number,
 *   startedAt: string,
 *   stoppedAt: string,
 *   audioDataUrl: string
 * }} VoiceCaptureResult
 */

/**
 * @typedef {{
 *   language: string,
 *   intent: string | null,
 *   responseText: string,
 *   workflow: string | null,
 *   confidence: number | null
 * }} VoiceAssistantResult
 */

/**
 * @typedef {{
 *   state: VoiceCaptureState,
 *   isCapturing: boolean,
 *   lastError: string | null,
 *   lastAssistantResult: VoiceAssistantResult | null
 * }} VoiceStatusSnapshot
 */

/** @type {VoiceStatusSnapshot} */
let voiceStatus = {
  state: 'idle',
  isCapturing: false,
  lastError: null,
  lastAssistantResult: null,
};

/** @type {VoiceCaptureResult | null} */
let pendingAudioCapture = null;

/** @type {AbortController | null} */
let assistantAbortController = null;

/** @type {Promise<void> | null} */
let assistantProcessingPromise = null;

/** @type {Promise<void> | null} */
let offscreenCreatePromise = null;

const api = new JanhitAPI();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void handleRuntimeMessage(message, sender, sendResponse);
  return true;
});

/**
 * @param {unknown} message
 * @param {chrome.runtime.MessageSender} sender
 * @param {(response?: unknown) => void} sendResponse
 */
async function handleRuntimeMessage(message, sender, sendResponse) {
  try {
    if (!message || typeof message !== 'object') {
      sendResponse({ success: false, error: 'Invalid runtime message' });
      return;
    }

    const candidate = /** @type {{ action?: unknown, target?: unknown }} */ (message);
    const action = typeof candidate.action === 'string' ? candidate.action : '';
    const target = typeof candidate.target === 'string' ? candidate.target : null;

    if (target && target !== 'background') {
      sendResponse({ success: false, error: 'Message was not targeted to background' });
      return;
    }

    switch (action) {
      case 'voice_capture_start':
        await startVoiceCapture();
        sendResponse({ success: true });
        return;

      case 'voice_capture_stop':
        await stopVoiceCapture();
        sendResponse({ success: true });
        return;

      case 'voice_capture_status':
        sendResponse({ success: true, state: voiceStatus });
        return;

      case 'voice_capture_completed':
        await handleVoiceCaptureCompleted(candidate);
        sendResponse({ success: true });
        return;

      case 'voice_capture_state_changed':
        await handleVoiceCaptureStateChanged(candidate);
        sendResponse({ success: true });
        return;

      case 'assistant_result_ready':
        sendResponse({ success: true, state: voiceStatus, result: voiceStatus.lastAssistantResult });
        return;

      default:
        sendResponse({ success: false, error: `Unknown background action: ${action}` });
    }
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'Unexpected background error';
    await updateVoiceStatus({
      state: 'error',
      isCapturing: false,
      lastError: messageText,
    });
    sendResponse({ success: false, error: messageText });
  }
}

async function startVoiceCapture() {
  if (voiceStatus.isCapturing) {
    return;
  }

  await updateVoiceStatus({
    state: 'requesting-permission',
    isCapturing: true,
    lastError: null,
  });

  await ensureOffscreenDocument();

  await chrome.runtime.sendMessage({
    action: 'offscreen_start_voice_capture',
    source: 'background',
    target: 'offscreen',
  });
}

async function stopVoiceCapture() {
  if (!voiceStatus.isCapturing && voiceStatus.state !== 'requesting-permission') {
    return;
  }

  await updateVoiceStatus({
    state: 'processing',
    isCapturing: true,
    lastError: null,
  });

  await chrome.runtime.sendMessage({
    action: 'offscreen_stop_voice_capture',
    source: 'background',
    target: 'offscreen',
  });
}

/**
 * @param {unknown} candidate
 */
async function handleVoiceCaptureCompleted(candidate) {
  const message = /** @type {{ result?: unknown }} */ (candidate);
  const result = sanitizeVoiceCaptureResult(message.result);

  if (!result) {
    throw new Error('Completed voice capture did not include audio data');
  }

  pendingAudioCapture = result;
  await updateVoiceStatus({
    state: 'transcribing',
    isCapturing: false,
    lastError: null,
  });

  await processAssistantRequest(result);
}

/**
 * @param {unknown} candidate
 */
async function handleVoiceCaptureStateChanged(candidate) {
  const message = /** @type {{ state?: unknown, error?: unknown }} */ (candidate);
  const state = sanitizeVoiceState(message.state);
  const error = typeof message.error === 'string' && message.error.trim() ? message.error : null;

  await updateVoiceStatus({
    state,
    isCapturing: state === 'listening' || state === 'requesting-permission',
    lastError: error,
  });
}

/**
 * @param {VoiceCaptureResult} capture
 */
async function processAssistantRequest(capture) {
  if (assistantProcessingPromise) {
    return;
  }

  assistantAbortController = new AbortController();

  assistantProcessingPromise = (async () => {
    try {
      const audioBlob = await dataUrlToBlob(capture.audioDataUrl);
      const transcriptResponse = await api.transcribeAudio(audioBlob, 'hi-IN', {
        signal: assistantAbortController.signal,
      });
      const transcript = typeof transcriptResponse.transcript === 'string' ? transcriptResponse.transcript : '';

      if (!transcript) {
        throw new Error('Transcription returned no text');
      }

      await updateVoiceStatus({
        state: 'thinking',
        isCapturing: false,
        lastError: null,
      });

      const processResponse = await api.processTranscript(transcript, {
        currentUrl: await getCurrentTabUrl(),
      }, {
        signal: assistantAbortController.signal,
      });

      const assistantResult = buildAssistantResult(transcript, processResponse);
      const formResponse = await api.generateFormDraft(
        assistantResult.intent || 'municipal_complaint',
        {
          transcript,
          entities: processResponse.data.entities,
          workflow: assistantResult.workflow,
        },
        {
          signal: assistantAbortController.signal,
        }
      );

      await updateVoiceStatus({
        state: 'speaking',
        isCapturing: false,
        lastError: null,
        lastAssistantResult: assistantResult,
      });

      await chrome.runtime.sendMessage({
        action: 'assistant_response_ready',
        source: 'background',
        target: 'popup',
        state: voiceStatus,
        result: assistantResult,
      });

      await autofillCurrentForm({
        ...assistantResult,
        form: formResponse.form,
      });

      const synthesizedResponse = await api.synthesizeSpeech(assistantResult.responseText, assistantResult.language, {
        signal: assistantAbortController.signal,
      });

      if (typeof synthesizedResponse.audio_url === 'string') {
        await chrome.runtime.sendMessage({
          action: 'offscreen_play_audio',
          source: 'background',
          target: 'offscreen',
          audioDataUrl: synthesizedResponse.audio_url,
        });
      }

      await updateVoiceStatus({
        state: 'idle',
        isCapturing: false,
        lastError: null,
        lastAssistantResult: assistantResult,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      const message = error instanceof Error ? error.message : 'Unable to process voice request';
      await updateVoiceStatus({
        state: 'error',
        isCapturing: false,
        lastError: message,
      });
    } finally {
      assistantProcessingPromise = null;
      assistantAbortController = null;
      pendingAudioCapture = null;
    }
  })();

  await assistantProcessingPromise;
}

/**
 * @param {Partial<VoiceStatusSnapshot>} partial
 */
async function updateVoiceStatus(partial) {
  voiceStatus = {
    ...voiceStatus,
    ...partial,
  };

  try {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['POPUP'] });

    if (contexts.length > 0) {
      await chrome.runtime.sendMessage({
        action: 'voice_capture_state_changed',
        source: 'background',
        target: 'popup',
        state: voiceStatus,
      });
    }
  } catch {
    // Popup may be closed; the background state remains authoritative.
  }
}

async function ensureOffscreenDocument() {
  if (offscreenCreatePromise) {
    await offscreenCreatePromise;
    return;
  }

  offscreenCreatePromise = (async () => {
    try {
      const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)],
      });

      if (existingContexts.length > 0) {
        return;
      }

      await chrome.offscreen.createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: ['USER_MEDIA'],
        justification: 'Required for Janhit push-to-talk microphone capture.',
      });
    } catch (error) {
      console.error('Failed to create offscreen document:', error);
      throw error;
    } finally {
      offscreenCreatePromise = null;
    }
  })();

  await offscreenCreatePromise;
}

/**
 * @param {VoiceAssistantResult} result
 */
async function autofillCurrentForm(result) {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];

    if (!activeTab?.id || !activeTab.url?.startsWith('http')) {
      return;
    }

    await chrome.tabs.sendMessage(activeTab.id, {
      action: 'autofill_form',
      source: 'background',
      target: 'content',
      data: result,
    });
  } catch {
    // Active tab may not have a content script yet or may be an extension page.
  }
}

async function getCurrentTabUrl() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];
    return typeof activeTab?.url === 'string' ? activeTab.url : 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * @param {unknown} value
 * @returns {VoiceCaptureResult | null}
 */
function sanitizeVoiceCaptureResult(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = /** @type {{
   * mimeType?: unknown,
   * durationMs?: unknown,
   * sizeBytes?: unknown,
   * startedAt?: unknown,
   * stoppedAt?: unknown,
   * audioDataUrl?: unknown
   * }} */ (value);

  const mimeType = typeof candidate.mimeType === 'string' && candidate.mimeType.trim() ? candidate.mimeType : 'audio/webm;codecs=opus';
  const audioDataUrl = typeof candidate.audioDataUrl === 'string' && candidate.audioDataUrl.startsWith('data:') ? candidate.audioDataUrl : '';

  if (!audioDataUrl) {
    return null;
  }

  return {
    mimeType,
    durationMs: typeof candidate.durationMs === 'number' ? candidate.durationMs : 0,
    sizeBytes: typeof candidate.sizeBytes === 'number' ? candidate.sizeBytes : 0,
    startedAt: typeof candidate.startedAt === 'string' ? candidate.startedAt : new Date().toISOString(),
    stoppedAt: typeof candidate.stoppedAt === 'string' ? candidate.stoppedAt : new Date().toISOString(),
    audioDataUrl,
  };
}

/**
 * @param {unknown} value
 * @returns {VoiceCaptureState}
 */
function sanitizeVoiceState(value) {
  if (
    value === 'idle' ||
    value === 'requesting-permission' ||
    value === 'listening' ||
    value === 'processing' ||
    value === 'transcribing' ||
    value === 'thinking' ||
    value === 'speaking' ||
    value === 'error'
  ) {
    return value;
  }

  return 'idle';
}

/**
 * @param {string} transcript
 * @param {{ data?: { intent?: unknown, entities?: unknown, nextQuestion?: unknown, workflow?: unknown, confidence?: unknown } | null }} response
 * @returns {VoiceAssistantResult}
 */
function buildAssistantResult(transcript, response) {
  const data = response.data && typeof response.data === 'object' ? response.data : {};
  const intent = typeof data.intent === 'string' ? data.intent : null;
  const workflow = typeof data.workflow === 'string' ? data.workflow : intent;
  const confidence = typeof data.confidence === 'number' ? data.confidence : null;
  const nextQuestion = typeof data.nextQuestion === 'string' ? data.nextQuestion : '';
  const responseText = nextQuestion || `I heard: "${transcript}". Please open the relevant government form and I can help fill it.`;

  return {
    language: 'hi-IN',
    intent,
    workflow,
    confidence,
    responseText,
  };
}

/**
 * @param {string} dataUrl
 * @returns {Promise<Blob>}
 */
function dataUrlToBlob(dataUrl) {
  return fetch(dataUrl).then((response) => response.blob());
}
