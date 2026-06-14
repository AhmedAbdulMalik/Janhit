// c:\Users\iyand\Downloads\Janhit\src\extension\background\service-worker.js

import { JanhitAPI } from '../utils/api.js';

const OFFSCREEN_DOCUMENT_PATH = 'offscreen/index.html';

/** @type {any} */
const chrome = /** @type {any} */ (globalThis).chrome;

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
 *   confidence: number | null,
 *   form?: unknown,
 *   browserAction?: unknown,
 *   domAction?: unknown,
 *   data?: { intent?: unknown, nextQuestion?: unknown, workflow?: unknown, confidence?: unknown, browserAction?: unknown, domAction?: unknown } | null,
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

/** @type {AbortController | null} */
let assistantAbortController = null;

/** @type {Promise<void> | null} */
let assistantProcessingPromise = null;

/** @type {Promise<void> | null} */
let offscreenCreatePromise = null;

const api = new JanhitAPI('https://janhit.abdulmalikandanas.workers.dev');

chrome.runtime.onMessage.addListener(
  /**
   * @param {unknown} message
   * @param {unknown} _sender
   * @param {(response?: unknown) => void} sendResponse
   */
  (message, _sender, sendResponse) => {
    void handleRuntimeMessage(message, sendResponse);
    return true;
  }
);

if (chrome.commands?.onCommand) {
  chrome.commands.onCommand.addListener(
    /** @param {string} command */
    async (command) => {
      if (command !== 'toggle-voice-capture') {
        return;
      }

      if (voiceStatus.isCapturing) {
        await stopVoiceCapture();
      } else {
        await startVoiceCapture();
      }
    }
  );
}

/**
 * @param {unknown} message
 * @param {(response?: unknown) => void} sendResponse
 */
async function handleRuntimeMessage(message, sendResponse) {
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

      case 'confirm_dom_action':
        {
          const payload = /** @type {{ domAction?: unknown, accept?: unknown }} */ (message);
          const domAction = payload.domAction && typeof payload.domAction === 'object' ? payload.domAction : null;
          const accept = payload.accept === true;

          if (domAction && accept) {
            const activeTab = await getActiveHttpTab();
            if (activeTab?.id) {
              try {
                await handleDomAction(activeTab.id, domAction);
              } catch (e) {
                console.error('Failed to execute confirmed domAction', e);
              }
            }
          }

          sendResponse({ success: true });
          return;
        }

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
      const activeTab = await getActiveHttpTab();
      const pageContext = activeTab ? await getPageContext(activeTab.id) : null;

      const voiceAssistResponse = await api.voiceAssist(audioBlob, 'auto', {
        currentUrl: activeTab?.url || 'unknown',
        currentTitle: activeTab?.title || '',
        page: pageContext,
      }, {
        signal: assistantAbortController.signal,
      });

      const assistantResult = buildAssistantResult(voiceAssistResponse);
      // Debug: surface browserAction returned by the backend for easier troubleshooting
      try {
        console.debug('voiceAssistResponse.browserAction:', voiceAssistResponse.browserAction || voiceAssistResponse.data?.browserAction || null);
        console.debug('assistantResult.browserAction:', assistantResult.browserAction || null);
      } catch (e) {
        // ignore logging errors in some environments
      }
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

      if (activeTab?.id) {
        await chrome.tabs.sendMessage(activeTab.id, {
          action: 'assistant_response_ready',
          source: 'background',
          target: 'content',
          result: assistantResult,
        });

        // Prefer domAction if provided by the backend
        const voiceAssistData = /** @type {{ domAction?: unknown }} */ (voiceAssistResponse.data || {});
        const domAction = assistantResult.domAction || voiceAssistData.domAction || null;

        if (domAction && typeof domAction === 'object') {
          try {
            await handleDomAction(activeTab.id, domAction);
          } catch (e) {
            // fallback to browserAction if domAction handling fails
            await executeBrowserAction(activeTab.id, assistantResult.browserAction);
            await autofillCurrentForm(activeTab.id, assistantResult);
          }
        } else {
          await executeBrowserAction(activeTab.id, assistantResult.browserAction);
          await autofillCurrentForm(activeTab.id, assistantResult);
        }
      }

      if (typeof voiceAssistResponse.audio_url === 'string' && voiceAssistResponse.audio_url) {
        await chrome.runtime.sendMessage({
          action: 'offscreen_play_audio',
          source: 'background',
          target: 'offscreen',
          audioDataUrl: voiceAssistResponse.audio_url,
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

  await broadcastVoiceStatus(voiceStatus);
}

/**
 * @param {VoiceStatusSnapshot} state
 */
async function broadcastVoiceStatus(state) {
  try {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['POPUP'] });

    if (contexts.length > 0) {
      await chrome.runtime.sendMessage({
        action: 'voice_capture_state_changed',
        source: 'background',
        target: 'popup',
        state,
      });
    }
  } catch {
    // Popup may be closed.
  }

  try {
    const activeTab = await getActiveHttpTab();
    if (activeTab?.id) {
      await chrome.tabs.sendMessage(activeTab.id, {
        action: 'voice_capture_state_changed',
        source: 'background',
        target: 'content',
        state,
      });
    }
  } catch {
    // Content script may not be available on this page.
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
        reasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'],
        justification: 'Required for Janhit push-to-talk microphone capture and voice reply playback.',
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
 * @param {number} tabId
 * @param {VoiceAssistantResult} result
 */
async function autofillCurrentForm(tabId, result) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      action: 'autofill_form',
      source: 'background',
      target: 'content',
      data: result,
    });
  } catch {
    // Active tab may not have a content script yet or may be an extension page.
  }
}

/**
 * @returns {Promise<any | null>}
 */
async function getActiveHttpTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];

  if (!activeTab?.id || !activeTab.url?.startsWith('http')) {
    return null;
  }

  return activeTab;
}

/**
 * @param {number} tabId
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function getPageContext(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      action: 'get_page_context',
      source: 'background',
      target: 'content',
    });

    if (response && typeof response === 'object') {
      const candidate = /** @type {{ success?: unknown, context?: unknown }} */ (response);

      if (candidate.success === true && candidate.context && typeof candidate.context === 'object') {
        return /** @type {Record<string, unknown>} */ (candidate.context);
      }
    }
  } catch {
    // Some pages cannot receive content-script messages; the assistant can still answer from voice.
  }

  // If content script did not respond, try a direct scripting.executeScript fallback to collect a minimal page context.
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        try {
          /** @param {Node | null} node */
          const getText = (node) => {
            if (node instanceof HTMLElement) {
              return node.innerText;
            }
            if (document.body instanceof HTMLElement) {
              return document.body.innerText;
            }
            return '';
          };
          const candidates = Array.from(document.querySelectorAll('input, textarea, select, button, a'))
            .filter((el) => {
              try {
                const rect = el.getBoundingClientRect();
                return rect.width > 1 && rect.height > 1;
              } catch {
                return false;
              }
            })
            .slice(0, 90)
            .map((el, idx) => {
              const rect = (() => { try { return el.getBoundingClientRect(); } catch { return { left:0, top:0, width:0, height:0 }; } })();
              return {
                id: el.id || `el_${idx}`,
                tag: el.tagName.toLowerCase(),
                label: el.getAttribute('aria-label') || (() => { const labelEl = el.closest('label'); return labelEl ? (labelEl.textContent || '') : ''; })() || (el.textContent || '') || '',
                name: el.getAttribute('name') || el.getAttribute('id') || '',
                placeholder: el.getAttribute('placeholder') || '',
                text: el.textContent || '',
                selector: (() => {
                  if (el.id) return `#${CSS.escape(el.id)}`;
                  let path = [];
                  let cur = /** @type {Element | null} */ (el);
                  while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
                    let sel = cur.tagName.toLowerCase();
                    if (cur.id) { sel += `#${CSS.escape(cur.id)}`; path.unshift(sel); break; }
                    if (cur.className && typeof cur.className === 'string') sel += '.' + Array.from(cur.classList).map(c=>CSS.escape(c)).join('.');
                    const curTagName = cur.tagName;
                    const siblings = Array.from(cur.parentNode ? cur.parentNode.children : []).filter(ch => ch.tagName === curTagName);
                    if (siblings.length > 1) sel += `:nth-of-type(${siblings.indexOf(cur)+1})`;
                    path.unshift(sel);
                    cur = cur.parentElement;
                  }
                  return path.join(' > ');
                })(),
                clickable: !!(el instanceof HTMLButtonElement || el instanceof HTMLAnchorElement || el.getAttribute('role') === 'button'),
                rect: { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) },
              };
            });

          return {
            url: window.location.href,
            title: document.title || '',
            language: document.documentElement.lang || navigator.language || 'en',
            viewport: { width: window.innerWidth, height: window.innerHeight, scrollX: window.scrollX, scrollY: window.scrollY },
            activeElementId: document.activeElement instanceof Element ? (document.activeElement.id || null) : null,
            elements: candidates,
            visibleText: getText(document.body || document.documentElement),
          };
        } catch (e) {
          return null;
        }
      },
    });

    if (Array.isArray(results) && results[0] && results[0].result && typeof results[0].result === 'object') {
      return results[0].result;
    }
  } catch (e) {
    // scripting.executeScript can fail on some pages (CSP or restricted frames).
  }

  return null;
}

/**
 * @param {number} tabId
 * @param {unknown} browserAction
 */
async function executeBrowserAction(tabId, browserAction) {
  if (!browserAction || typeof browserAction !== 'object') {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tabId, {
      action: 'execute_browser_action',
      source: 'background',
      target: 'content',
      browserAction,
    });
  } catch {
    // Browser action execution is best-effort; voice response still completes.
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
 * @param {{ language?: unknown, intent?: unknown, workflow?: unknown, confidence?: unknown, responseText?: unknown, pageSummary?: unknown, form?: unknown, browserAction?: unknown, domAction?: unknown, data?: { intent?: unknown, nextQuestion?: unknown, workflow?: unknown, confidence?: unknown, browserAction?: unknown, domAction?: unknown, pageSummary?: unknown } | null }} response
 * @returns {VoiceAssistantResult}
 */
function buildAssistantResult(response) {
  const data = /** @type {{ intent?: unknown, nextQuestion?: unknown, workflow?: unknown, confidence?: unknown, browserAction?: unknown, domAction?: unknown, pageSummary?: unknown }} */ (response.data && typeof response.data === 'object' ? response.data : {});
  const intent = typeof response.intent === 'string'
    ? response.intent
    : typeof data.intent === 'string'
      ? data.intent
      : null;
  const workflow = typeof response.workflow === 'string'
    ? response.workflow
    : typeof data.workflow === 'string'
      ? data.workflow
      : intent;
  const confidence = typeof response.confidence === 'number'
    ? response.confidence
    : typeof data.confidence === 'number'
      ? data.confidence
      : null;
  const nextQuestion = typeof data.nextQuestion === 'string' ? data.nextQuestion : '';
  const responseText = typeof response.responseText === 'string' && response.responseText.trim()
    ? response.responseText
    : nextQuestion || 'Please share one more detail so I can guide you correctly.';
  const pageSummary = typeof response.pageSummary === 'string' && response.pageSummary.trim()
    ? response.pageSummary.trim()
    : typeof data.pageSummary === 'string' && data.pageSummary.trim()
      ? data.pageSummary.trim()
      : '';

  return {
    language: typeof response.language === 'string' && response.language.trim() ? response.language : 'hi-IN',
    intent,
    workflow,
    confidence,
    responseText,
    pageSummary,
    form: response.form,
    browserAction: response.browserAction || data.browserAction,
    domAction: response.domAction || data.domAction || null,
  };
}

/**
 * Map a domAction to content-script messages and execute them.
 * @param {number} tabId
 * @param {object} domAction
 */
async function handleDomAction(tabId, domAction) {
  if (!domAction || typeof domAction !== 'object') return;

  const actionSource = /** @type {{ [key: string]: unknown }} */ (domAction);
  const act = typeof actionSource.action === 'string'
    ? actionSource.action
    : typeof actionSource.type === 'string'
      ? actionSource.type
      : null;

  if (act === 'highlight' || act === 'scroll' || act === 'focus' || act === 'click') {
    const mapping = {
      highlight: 'highlight',
      scroll: 'scroll_to',
      focus: 'focus',
      click: 'click',
    };

    const browserAction = {
      type: mapping[act] || 'none',
      targetId: typeof actionSource.target_id === 'string' ? actionSource.target_id :
                typeof actionSource.targetId === 'string' ? actionSource.targetId : null,
      targetSelector: typeof actionSource.targetSelector === 'string' ? actionSource.targetSelector :
                      typeof actionSource.target_selector === 'string' ? actionSource.target_selector :
                      typeof actionSource.target === 'string' ? actionSource.target :
                      typeof actionSource.selector === 'string' ? actionSource.selector : '',
      value: typeof actionSource.value === 'string' ? actionSource.value : '',
      label: typeof actionSource.label === 'string' ? actionSource.label : '',
    };

    await executeBrowserAction(tabId, browserAction);
    return;
  }

  if (act === 'fill_form') {
    // Construct payload for autofill_form: { fields: [{ name,label,type,value }], draft }
    const fills = Array.isArray(actionSource.fills) ? actionSource.fills : [];
    const fields = fills.map((f) => {
      const fill = /** @type {{ selector?: unknown, name?: unknown, label?: unknown, value?: unknown }} */ (f);
      return {
        name: typeof fill.selector === 'string' ? fill.selector : typeof fill.name === 'string' ? fill.name : '',
        label: typeof fill.selector === 'string' ? fill.selector : typeof fill.label === 'string' ? fill.label : '',
        type: 'text',
        value: typeof fill.value === 'string' ? fill.value : '',
      };
    });

    await chrome.tabs.sendMessage(tabId, {
      action: 'autofill_form',
      source: 'background',
      target: 'content',
      data: { fields, draft: typeof actionSource.draft === 'string' ? actionSource.draft : '' },
    });

    return;
  }

  // answer_question and none do not trigger page actions
}

/**
 * @param {string} dataUrl
 * @returns {Promise<Blob>}
 */
function dataUrlToBlob(dataUrl) {
  return fetch(dataUrl).then((response) => response.blob());
}
