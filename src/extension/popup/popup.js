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
 *   pageSummary?: string,
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
 *   pageText: HTMLElement | null,
 *   actionText: HTMLElement | null,
 *   targetsText: HTMLElement | null
 * }} */
const elements = {
  voiceButton: null,
  toggleLabel: null,
  statusText: null,
  pageText: null,
  actionText: null,
  targetsText: null,
};

/** @type {VoiceStatusSnapshot} */
let currentState = {
  state: 'idle',
  isCapturing: false,
  lastError: null,
  lastAssistantResult: null,
};

document.addEventListener('DOMContentLoaded', () => {
  cacheDomReferences();
  bindPushToTalkControls();
  bindRuntimeMessages();
  void refreshVoiceStatus();
});

function cacheDomReferences() {
  elements.voiceButton = document.getElementById('voice-btn');
  elements.toggleLabel = document.getElementById('toggle-label');
  elements.statusText = document.getElementById('status');
  elements.pageText = document.getElementById('page-text');
  elements.actionText = document.getElementById('action-text');
  elements.targetsText = document.getElementById('targets-text');
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
    void releasePushToTalk();
  }
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

  renderAssistantLines(rawResult, result);

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

  if (currentState.state === 'requesting-permission') {
    elements.toggleLabel.textContent = 'Grant Access';
    elements.statusText.textContent = 'Approve microphone permission to start.';
    return;
  }

  if (currentState.state === 'listening') {
    elements.voiceButton.classList.add('listening');
    elements.toggleLabel.textContent = 'Listening';
    elements.statusText.textContent = 'Listening for your command.';
    return;
  }

  if (currentState.state === 'processing') {
    elements.voiceButton.classList.add('processing');
    elements.toggleLabel.textContent = 'Processing';
    elements.statusText.textContent = 'Processing your request.';
    return;
  }

  if (currentState.state === 'transcribing') {
    elements.voiceButton.classList.add('processing');
    elements.toggleLabel.textContent = 'Transcribing';
    elements.statusText.textContent = 'Converting speech to text.';
    return;
  }

  if (currentState.state === 'thinking') {
    elements.voiceButton.classList.add('processing');
    elements.toggleLabel.textContent = 'Thinking';
    elements.statusText.textContent = 'Finding the right page action.';
    return;
  }

  if (currentState.state === 'speaking') {
    elements.voiceButton.classList.add('processing');
    elements.toggleLabel.textContent = 'Speaking';
    elements.statusText.textContent = 'Reply ready.';
    return;
  }

  if (currentState.state === 'error') {
    elements.voiceButton.classList.add('error');
    elements.toggleLabel.textContent = 'Mic Error';
    elements.statusText.textContent = currentState.lastError || 'Microphone capture failed. Try again.';
    return;
  }

  elements.toggleLabel.textContent = 'Ready';
  elements.statusText.textContent = 'Press and hold to talk.';
}

/**
 * @param {unknown} rawResult
 * @returns {string}
 */
function renderCandidateSuffix(rawResult) {
  if (!rawResult || typeof rawResult !== 'object') {
    return '';
  }

  const candidate = /** @type {{ domAction?: { target_candidates?: unknown } }} */ (rawResult);
  const domAction = candidate.domAction;
  const targetCandidates = domAction && Array.isArray(domAction.target_candidates) ? domAction.target_candidates : [];

  if (targetCandidates.length === 0) {
    return '';
  }

  const labels = targetCandidates
    .slice(0, 3)
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const target = /** @type {{ label?: unknown, kind?: unknown, role?: unknown, type?: unknown, selector?: unknown }} */ (item);
      const label = typeof target.label === 'string' ? target.label : '';
      const kind = typeof target.kind === 'string' ? target.kind : '';
      const role = typeof target.role === 'string' ? target.role : '';
      const type = typeof target.type === 'string' ? target.type : '';
      return renderTargetChip(label, kind, role, type);
    })
    .filter(Boolean);

  return labels.length > 0 ? labels.join('') : '';
}

/**
 * @param {unknown} rawResult
 * @param {VoiceAssistantResult} result
 */
function renderAssistantLines(rawResult, result) {
  const pageSummary = extractPageSummary(rawResult);
  const actionLine = buildActionLine(result);
  const targetsLine = renderCandidateSuffix(rawResult);

  if (elements.pageText) {
    elements.pageText.textContent = `Page: ${pageSummary || 'Unknown'}`;
  }

  if (elements.actionText) {
    elements.actionText.textContent = `Action: ${actionLine}`;
  }

  if (elements.targetsText) {
    if (targetsLine) {
      elements.targetsText.innerHTML = `<span>Targets:</span> <span class="target-list">${targetsLine}</span>`;
    } else {
      elements.targetsText.textContent = 'Targets: None yet.';
    }
  }
}

/**
 * @param {unknown} rawResult
 * @returns {string}
 */
function extractPageSummary(rawResult) {
  if (!rawResult || typeof rawResult !== 'object') {
    return '';
  }

  const candidate = /** @type {{ pageSummary?: unknown, domAction?: { pageSummary?: unknown }, data?: { pageSummary?: unknown } }} */ (rawResult);
  const direct = typeof candidate.pageSummary === 'string' ? candidate.pageSummary : '';
  const domSummary = candidate.domAction && typeof candidate.domAction.pageSummary === 'string' ? candidate.domAction.pageSummary : '';
  const dataSummary = candidate.data && typeof candidate.data.pageSummary === 'string' ? candidate.data.pageSummary : '';
  return direct || domSummary || dataSummary || '';
}

/**
 * @param {VoiceAssistantResult} result
 * @returns {string}
 */
function buildActionLine(result) {
  const pieces = [];
  if (result.intent) {
    pieces.push(result.intent.replace(/_/g, ' '));
  }
  if (result.workflow && result.workflow !== result.intent) {
    pieces.push(result.workflow.replace(/_/g, ' '));
  }
  if (typeof result.confidence === 'number') {
    pieces.push(`${(result.confidence * 100).toFixed(0)}%`);
  }
  return pieces.length > 0 ? pieces.join(' • ') : 'Waiting for input';
}

/**
 * @param {string} label
 * @param {string} kind
 * @param {string} role
 * @param {string} type
 * @returns {string}
 */
function renderTargetChip(label, kind, role, type) {
  const normalized = `${kind} ${role} ${type} ${label}`.toLowerCase();
  const chipKind = kind || getChipKindFromText(normalized);
  const friendlyLabel = getFriendlyLabel(label, chipKind, normalized);

  return `<span class="target-chip ${chipKind}">${escapeHtml(friendlyLabel)}</span>`;
}

/**
 * @param {string} normalized
 * @returns {string}
 */
function getChipKindFromText(normalized) {
  if (normalized.includes('search')) return 'search';
  if (normalized.includes('link') || normalized.includes('anchor')) return 'link';
  if (normalized.includes('button') || normalized.includes('submit') || normalized.includes('click')) return 'button';
  if (normalized.includes('input') || normalized.includes('field') || normalized.includes('textarea') || normalized.includes('email') || normalized.includes('url')) return 'input';
  if (normalized.includes('checkbox')) return 'checkbox';
  if (normalized.includes('radio')) return 'radio';
  if (normalized.includes('select') || normalized.includes('combobox')) return 'dropdown';
  if (normalized.includes('tab')) return 'tab';
  return 'target';
}

/**
 * @param {string} label
 * @param {string} kind
 * @param {string} normalized
 * @returns {string}
 */
function getFriendlyLabel(label, kind, normalized) {
  const safeLabel = label || 'Target';
  if (kind === 'search' || normalized.includes('search')) return `Search: ${safeLabel}`;
  if (kind === 'link' || normalized.includes('link') || normalized.includes('anchor')) return `Link: ${safeLabel}`;
  if (kind === 'button' || normalized.includes('button') || normalized.includes('submit') || normalized.includes('click')) return `Button: ${safeLabel}`;
  if (kind === 'input' || normalized.includes('input') || normalized.includes('field') || normalized.includes('textarea') || normalized.includes('email') || normalized.includes('url')) return `Input: ${safeLabel}`;
  if (kind === 'checkbox' || normalized.includes('checkbox')) return `Checkbox: ${safeLabel}`;
  if (kind === 'radio' || normalized.includes('radio')) return `Radio: ${safeLabel}`;
  if (kind === 'dropdown' || normalized.includes('select') || normalized.includes('combobox')) return `Dropdown: ${safeLabel}`;
  if (kind === 'tab' || normalized.includes('tab')) return `Tab: ${safeLabel}`;
  return safeLabel;
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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
