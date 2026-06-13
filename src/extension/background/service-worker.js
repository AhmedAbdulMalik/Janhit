// c:\Users\iyand\Downloads\Janhit\src\extension\background\service-worker.js

const OFFSCREEN_DOCUMENT_PATH = 'offscreen/audio.html';

async function ensureOffscreenDocument() {
  try {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
    });

    if (existingContexts.length > 0) return;

    await chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: ['USER_MEDIA'],
      justification: 'Required for Push-To-Talk microphone capture'
    });
  } catch (error) {
    console.error('Failed to create offscreen document:', error);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START_RECORDING') {
    ensureOffscreenDocument().then(() => {
      chrome.runtime.sendMessage({ action: 'OFFSCREEN_START_MIC' }).catch(() => {});
    });
    sendResponse({ status: 'starting' });
    return true; // Keep channel open
  }
  
  if (message.action === 'STOP_RECORDING') {
    chrome.runtime.sendMessage({ action: 'OFFSCREEN_STOP_MIC' }).catch(() => {});
    // We can destroy the offscreen document to free memory if needed
    // chrome.offscreen.closeDocument();
    sendResponse({ status: 'stopping' });
    return true;
  }

  return false;
});