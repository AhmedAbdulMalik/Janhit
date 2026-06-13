// c:\Users\iyand\Downloads\Janhit\src\extension\offscreen\offscreen.js

/**
 * Offscreen microphone capture runtime.
 * Maintains the MediaRecorder lifecycle outside the popup so capture survives UI focus changes.
 */

/**
 * @typedef {{
 *   action: string,
 *   source?: 'background' | 'popup' | 'offscreen',
 *   target?: 'background' | 'popup' | 'offscreen',
 *   [key: string]: unknown
 * }} OffscreenMessage
 */

/** @type {MediaStream | null} */
let activeStream = null;

/** @type {MediaRecorder | null} */
let activeRecorder = null;

/** @type {Blob[]} */
let audioChunks = [];

/** @type {number | null} */
let captureStartTimestamp = null;

/** @type {HTMLAudioElement | null} */
let playbackElement = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  void handleOffscreenMessage(request, sendResponse);
  return true;
});

/**
 * @param {OffscreenMessage} request
 * @param {(response?: unknown) => void} sendResponse
 */
async function handleOffscreenMessage(request, sendResponse) {
  try {
    if (!request || typeof request.action !== 'string') {
      sendResponse({ success: false, error: 'Invalid offscreen message' });
      return;
    }

    if (request.target && request.target !== 'offscreen') {
      return;
    }

    if (request.action === 'offscreen_start_voice_capture') {
      await startVoiceCapture();
      sendResponse({ success: true });
      return;
    }

    if (request.action === 'offscreen_stop_voice_capture') {
      await stopVoiceCapture();
      sendResponse({ success: true });
      return;
    }

    if (request.action === 'offscreen_play_audio') {
      const audioDataUrl = typeof request.audioDataUrl === 'string' ? request.audioDataUrl : '';
      await playResponseAudio(audioDataUrl);
      sendResponse({ success: true });
      return;
    }

    sendResponse({ success: false, error: `Unknown offscreen action: ${request.action}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected offscreen error';
    await notifyBackgroundState('error', message);
    sendResponse({ success: false, error: message });
  }
}

async function startVoiceCapture() {
  if (activeRecorder && activeRecorder.state === 'recording') {
    return;
  }

  await notifyBackgroundState('requesting-permission');

  activeStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });

  audioChunks = [];
  captureStartTimestamp = Date.now();
  activeRecorder = new MediaRecorder(activeStream, {
    mimeType: getSupportedMimeType(),
    audioBitsPerSecond: 128000,
  });

  activeRecorder.addEventListener('dataavailable', handleDataAvailable);
  activeRecorder.addEventListener('stop', handleRecorderStop, { once: true });
  activeRecorder.addEventListener('error', handleRecorderError, { once: true });
  activeRecorder.start(250);

  await notifyBackgroundState('listening');
}

async function stopVoiceCapture() {
  if (!activeRecorder) {
    await cleanupResources();
    await notifyBackgroundState('idle');
    return;
  }

  if (activeRecorder.state === 'inactive') {
    await cleanupResources();
    await notifyBackgroundState('idle');
    return;
  }

  await notifyBackgroundState('processing');
  activeRecorder.stop();
}

/**
 * @param {BlobEvent} event
 */
function handleDataAvailable(event) {
  if (event.data && event.data.size > 0) {
    audioChunks.push(event.data);
  }
}

async function handleRecorderStop() {
  try {
    const mimeType = activeRecorder && activeRecorder.mimeType ? activeRecorder.mimeType : getSupportedMimeType();
    const startedAt = captureStartTimestamp ? new Date(captureStartTimestamp).toISOString() : new Date().toISOString();
    const stoppedTimestamp = Date.now();
    const stoppedAt = new Date(stoppedTimestamp).toISOString();
    const audioBlob = new Blob(audioChunks, { type: mimeType });
    const audioDataUrl = await blobToDataUrl(audioBlob);
    const durationMs = captureStartTimestamp ? Math.max(0, stoppedTimestamp - captureStartTimestamp) : 0;

    await cleanupResources();

    await chrome.runtime.sendMessage({
      action: 'voice_capture_completed',
      source: 'offscreen',
      target: 'background',
      result: {
        mimeType,
        durationMs,
        sizeBytes: audioBlob.size,
        startedAt,
        stoppedAt,
        audioDataUrl,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to finalize audio capture';
    await cleanupResources();
    await notifyBackgroundState('error', message);
  }
}

/**
 * @param {Event} event
 */
async function handleRecorderError(event) {
  const message = event instanceof ErrorEvent && event.message
    ? event.message
    : 'Media recorder failed during capture';

  await cleanupResources();
  await notifyBackgroundState('error', message);
}

async function cleanupResources() {
  if (activeRecorder) {
    activeRecorder.removeEventListener('dataavailable', handleDataAvailable);
  }

  if (activeStream) {
    activeStream.getTracks().forEach((track) => {
      track.stop();
    });
  }

  activeRecorder = null;
  activeStream = null;
  audioChunks = [];
  captureStartTimestamp = null;
}

/**
 * @param {string} audioDataUrl
 */
async function playResponseAudio(audioDataUrl) {
  if (!audioDataUrl) {
    throw new Error('No audio response available for playback');
  }

  if (!playbackElement) {
    playbackElement = new Audio();
    playbackElement.preload = 'auto';
  }

  playbackElement.pause();
  playbackElement.currentTime = 0;
  playbackElement.src = audioDataUrl;

  await playbackElement.play();
}

/**
 * @param {'idle' | 'requesting-permission' | 'listening' | 'processing' | 'error'} state
 * @param {string | null} error
 */
async function notifyBackgroundState(state, error = null) {
  await chrome.runtime.sendMessage({
    action: 'voice_capture_state_changed',
    source: 'offscreen',
    target: 'background',
    state,
    error,
  });
}

function getSupportedMimeType() {
  const preferredMimeTypes = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
  ];

  const supportedMimeType = preferredMimeTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType));

  if (!supportedMimeType) {
    throw new Error('This browser does not support microphone recording');
  }

  return supportedMimeType;
}

/**
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onloadend = () => {
      const { result } = reader;

      if (typeof result === 'string') {
        resolve(result);
        return;
      }

      reject(new Error('Unable to read recorded audio'));
    };

    reader.onerror = () => {
      reject(reader.error || new Error('Unable to read recorded audio'));
    };

    reader.readAsDataURL(blob);
  });
}
