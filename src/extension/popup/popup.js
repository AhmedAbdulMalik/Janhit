// c:\Users\iyand\Downloads\Janhit\src\extension\popup\popup.js

/**
 * Popup runtime for push-to-talk interaction and capture playback.
 */

/**
 * @typedef {{
 *   action: string,
 *   source?: 'background' | 'popup' | 'offscreen',
 *   target?: 'background' | 'popup' | 'offscreen',
 *   [key: string]: unknown
 * }} RuntimeMessage
 */

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

/** @type {{
 *   voiceButton: HTMLButtonElement | null,
 *   toggleLabel: HTMLElement | null,
 *   statusText: HTMLElement | null,
 *   responseText: HTMLElement | null
 * }} */
const elements = {
  voiceButton: null,
  toggleLabel: null,
  statusText: null,
  responseText: null,
};

/** @type {VoiceStatusSnapshot} */
let currentState = {
  state: 'idle',
  isCapturing: false,
  lastError: null,
  lastAssistantResult: null,
};

let shortcutCaptureActive = false;
let pointerCaptureActive = false;

document.addEventListener('DOMContentLoaded', () => {
  cacheDomReferences();
  bindPushToTalkControls();
  bindLifecycleGuards();
  bindRuntimeMessages();
  void refreshVoiceStatus();
});

function cacheDomReferences() {
  elements.voiceButton = document.getElementById('voice-btn');
  elements.toggleLabel = document.getElementById('toggle-label');
  elements.statusText = document.getElementById('status');
  elements.responseText = document.getElementById('response-text');
}

function bindPushToTalkControls() {
  if (!elements.voiceButton) {
    throw new Error('Voice button element not found');
  }

  elements.voiceButton.addEventListener('pointerdown', handlePointerDown);
  elements.voiceButton.addEventListener('pointerup', handlePointerUp);
  elements.voiceButton.addEventListener('pointercancel', handlePointerCancel);
  elements.voiceButton.addEventListener('pointerleave', handlePointerLeave);
  elements.voiceButton.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });

  document.addEventListener('keydown', handleShortcutKeyDown);
  document.addEventListener('keyup', handleShortcutKeyUp);
}

function bindLifecycleGuards() {
  window.addEventListener('blur', () => {
    void releasePushToTalk();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      void releasePushToTalk();
    }
  });
}

function bindRuntimeMessages() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
      if (!message || typeof message.action !== 'string') {
        sendResponse({ success: false, error: 'Invalid popup message' });
        return;
      }

      if (message.target && message.target !== 'popup') {
        return;
      }

      if (message.action === 'voice_capture_state_changed' && message.state) {
        applyVoiceStatus(message.state);
        sendResponse({ success: true });
        return;
      }

      if (message.action === 'assistant_response_ready' && message.state && message.result) {
        applyVoiceStatus(message.state);
        renderAssistantResult(message.result);
        sendResponse({ success: true });
        return;
      }

      if (message.action === 'assistant_response_ready' && message.result) {
        renderAssistantResult(message.result);
        sendResponse({ success: true });
        return;
      }

      sendResponse({ success: false, error: 'Unhandled popup message' });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Popup message handling failed';
      sendResponse({ success: false, error: messageText });
    }
  });
}

/**
 * @param {PointerEvent} event
 */
function handlePointerDown(event) {
  event.preventDefault();
  pointerCaptureActive = true;

  if (elements.voiceButton) {
    elements.voiceButton.setPointerCapture(event.pointerId);
  }

  void requestVoiceCaptureStart();
}

/**
 * @param {PointerEvent} event
 */
function handlePointerUp(event) {
  event.preventDefault();
  pointerCaptureActive = false;

  if (elements.voiceButton && elements.voiceButton.hasPointerCapture(event.pointerId)) {
    elements.voiceButton.releasePointerCapture(event.pointerId);
  }

  void releasePushToTalk();
}

/**
 * @param {PointerEvent} event
 */
function handlePointerCancel(event) {
  event.preventDefault();
  pointerCaptureActive = false;

  if (elements.voiceButton && elements.voiceButton.hasPointerCapture(event.pointerId)) {
    elements.voiceButton.releasePointerCapture(event.pointerId);
  }

  void releasePushToTalk();
}

/**
 * @param {PointerEvent} event
 */
function handlePointerLeave(event) {
  if ((event.buttons & 1) !== 1) {
    pointerCaptureActive = false;
    void releasePushToTalk();
  }
}

/**
 * @param {KeyboardEvent} event
 */
function handleShortcutKeyDown(event) {
  if (!isPushToTalkShortcut(event)) {
    return;
  }

  event.preventDefault();

  if (shortcutCaptureActive) {
    return;
  }

  shortcutCaptureActive = true;
  void requestVoiceCaptureStart();
}

/**
 * @param {KeyboardEvent} event
 */
function handleShortcutKeyUp(event) {
  if (!shortcutCaptureActive) {
    return;
  }

  if (isPushToTalkShortcut(event)) {
    return;
  }

  shortcutCaptureActive = false;
  void releasePushToTalk();
}

async function requestVoiceCaptureStart() {
  try {
    if (currentState.isCapturing) {
      return;
    }

    await sendRuntimeMessage({ action: 'voice_capture_start' });
  } catch (error) {
    applyLocalError(error instanceof Error ? error.message : 'Unable to start voice capture');
  }
}

async function releasePushToTalk() {
  try {
    if (!currentState.isCapturing && currentState.state !== 'requesting-permission') {
      return;
    }

    await sendRuntimeMessage({ action: 'voice_capture_stop' });
  } catch (error) {
    applyLocalError(error instanceof Error ? error.message : 'Unable to stop voice capture');
  }
}

async function refreshVoiceStatus() {
  try {
    const response = await sendRuntimeMessage({ action: 'voice_capture_status' });

    if (response.state) {
      applyVoiceStatus(response.state);

      if (response.state.lastAssistantResult) {
        renderAssistantResult(response.state.lastAssistantResult);
      }
    }
  } catch (error) {
    applyLocalError(error instanceof Error ? error.message : 'Unable to load voice status');
  }
}

/**
 * @param {unknown} rawState
 */
function applyVoiceStatus(rawState) {
  const nextState = sanitizeVoiceStatus(rawState);
  currentState = nextState;
  renderVoiceUi();
}

/**
 * @param {unknown} rawResult
 */
function renderAssistantResult(rawResult) {
  const result = sanitizeAssistantResult(rawResult);
  currentState = {
    ...currentState,
    lastAssistantResult: result,
  };

  if (elements.responseText) {
    const details = [];

    if (result.intent) {
      details.push(`Intent: ${result.intent.replace(/_/g, ' ')}`);
    }

    if (result.workflow) {
      details.push(`Workflow: ${result.workflow.replace(/_/g, ' ')}`);
    }

    if (typeof result.confidence === 'number') {
      details.push(`Confidence: ${(result.confidence * 100).toFixed(0)}%`);
    }

    const detailSuffix = details.length > 0 ? ` (${details.join(' | ')})` : '';
    elements.responseText.textContent = `${result.responseText}${detailSuffix}`;
  }

  // If backend returned a domAction requiring confirmation (click/fill), surface it.
  try {
    if (rawResult && rawResult.domAction && (rawResult.domAction.action === 'click' || rawResult.domAction.action === 'fill_form')) {
      renderDomActionConfirmation(rawResult.domAction);
    }
  } catch (e) {
    // ignore UI errors
  }
}

/**
 * @param {string} message
 */
function applyLocalError(message) {
  currentState = {
    ...currentState,
    state: 'error',
    isCapturing: false,
    lastError: message,
  };
  renderVoiceUi();
}

function renderVoiceUi() {
  if (!elements.voiceButton || !elements.toggleLabel || !elements.statusText) {
    return;
  }

  elements.voiceButton.classList.remove('listening', 'processing', 'error', 'pressed');
  elements.voiceButton.setAttribute('aria-pressed', currentState.isCapturing ? 'true' : 'false');

  if (pointerCaptureActive || shortcutCaptureActive) {
    elements.voiceButton.classList.add('pressed');
  }

  if (currentState.state === 'requesting-permission') {
    elements.toggleLabel.textContent = 'Grant Access';
    elements.statusText.textContent = 'Approve microphone permission to let Janhit start listening.';
    return;
  }

  if (currentState.state === 'listening') {
    elements.voiceButton.classList.add('listening');
    elements.toggleLabel.textContent = 'Listening';
    elements.statusText.textContent = 'Recording live audio now. Release the button or shortcut to stop.';
    return;
  }

  if (currentState.state === 'processing') {
    elements.voiceButton.classList.add('processing');
    elements.toggleLabel.textContent = 'Processing';
    elements.statusText.textContent = 'Audio capture finished. Preparing the recording for the next AI step.';
    return;
  }

  if (currentState.state === 'transcribing') {
    elements.voiceButton.classList.add('processing');
    elements.toggleLabel.textContent = 'Transcribing';
    elements.statusText.textContent = 'Sending your speech to the worker for Sarvam transcription.';
    return;
  }

  if (currentState.state === 'thinking') {
    elements.voiceButton.classList.add('processing');
    elements.toggleLabel.textContent = 'Thinking';
    elements.statusText.textContent = 'Understanding your request and preparing the reply.';
    return;
  }

  if (currentState.state === 'speaking') {
    elements.voiceButton.classList.add('processing');
    elements.toggleLabel.textContent = 'Speaking';
    elements.statusText.textContent = 'Voice reply is being generated and played back. Clicky Buddy is pointing it out.';
  if (currentState.state === 'error') {
    elements.voiceButton.classList.add('error');
    elements.toggleLabel.textContent = 'Mic Error';
    elements.statusText.textContent = currentState.lastError || 'Microphone capture failed. Try again.';
    return;
  }

  elements.toggleLabel.textContent = 'Ready';
  elements.statusText.textContent = 'Press and hold the mic button to talk to Janhit.';
}

/**
 * @param {KeyboardEvent} event
 * @returns {boolean}
 */
function isPushToTalkShortcut(event) {
  const platform = navigator.platform.toUpperCase();
  const isMac = platform.includes('MAC');
  const hasControl = event.ctrlKey;
  const hasAlt = event.altKey;
  const hasExtraModifiers = event.metaKey || event.shiftKey;

  if (hasExtraModifiers) {
    return false;
  }

  if (isMac) {
    return hasControl && hasAlt;
  }

  return hasControl && hasAlt;
}

/**
 * @param {RuntimeMessage} message
 * @returns {Promise<{ success: boolean, state?: VoiceStatusSnapshot, error?: string }>}
 */
async function sendRuntimeMessage(message) {
  const response = await chrome.runtime.sendMessage({
    ...message,
    source: 'popup',
    target: 'background',
  });

  if (!response || response.success !== true) {
    const messageText = response && typeof response.error === 'string'
      ? response.error
      : 'Unexpected runtime response';

    throw new Error(messageText);
  }

  return response;
}

/**
 * @param {unknown} value
 * @returns {VoiceStatusSnapshot}
 */
function sanitizeVoiceStatus(value) {
  if (!value || typeof value !== 'object') {
    return {
      state: 'idle',
      isCapturing: false,
      lastError: 'Invalid voice state received',
      lastAssistantResult: null,
    };
  }

  const candidate = /** @type {{
   * state?: unknown,
   * isCapturing?: unknown,
   * lastError?: unknown,
   * lastAssistantResult?: unknown
   * }} */ (value);

  return {
    state: sanitizeVoiceState(candidate.state),
    isCapturing: candidate.isCapturing === true,
    lastError: typeof candidate.lastError === 'string' ? candidate.lastError : null,
    lastAssistantResult: candidate.lastAssistantResult ? sanitizeAssistantResult(candidate.lastAssistantResult) : null,
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
 * @param {unknown} value
 * @returns {VoiceAssistantResult}
 */
function sanitizeAssistantResult(value) {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid assistant result received');
  }

  const candidate = /** @type {{
   * transcript?: unknown,
   * language?: unknown,
   * intent?: unknown,
   * responseText?: unknown,
   * audioDataUrl?: unknown,
   * workflow?: unknown,
   * confidence?: unknown
   * }} */ (value);

  return {
    language: typeof candidate.language === 'string' ? candidate.language : 'en',
    intent: typeof candidate.intent === 'string' && candidate.intent.trim() ? candidate.intent : null,
    responseText: typeof candidate.responseText === 'string' ? candidate.responseText : '',
    workflow: typeof candidate.workflow === 'string' && candidate.workflow.trim() ? candidate.workflow : null,
    confidence: typeof candidate.confidence === 'number' ? candidate.confidence : null,
    domAction: candidate.domAction || null,
  };
}

function renderDomActionConfirmation(domAction) {
  const container = document.getElementById('dom-action-confirm');
  const text = document.getElementById('dom-action-text');
  const accept = document.getElementById('dom-action-accept');
  const reject = document.getElementById('dom-action-reject');

  if (!container || !text || !accept || !reject) return;

  text.textContent = domAction.spoken_text || `Assistant suggests: ${domAction.action}`;
  container.style.display = 'block';

  const cleanup = () => { container.style.display = 'none'; accept.onclick = null; reject.onclick = null; };

  accept.onclick = async () => {
    try {
      await sendRuntimeMessage({ action: 'confirm_dom_action', domAction, accept: true });
    } catch (e) {
      console.error(e);
    } finally {
      cleanup();
    }
  };

  reject.onclick = async () => {
    try {
      await sendRuntimeMessage({ action: 'confirm_dom_action', domAction, accept: false });
    } catch (e) {
      console.error(e);
    } finally {
      cleanup();
    }
  };
}
