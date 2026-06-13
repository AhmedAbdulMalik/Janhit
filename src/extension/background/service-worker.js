// c:\Users\iyand\Downloads\Janhit\src\extension\background\service-worker.js

/**
 * Background service worker for Janhit
 * Handles API calls, message routing, and state management
 */

const API_BASE_URL = 'https://janhit.example.com';

// Initialize service worker
chrome.runtime.onInstalled.addListener(() => {
  console.log('Janhit extension installed');
  chrome.storage.local.set({ installed: true });
});

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received in background:', request);

  if (request.action === 'process_user_input') {
    processUserInput(request.input)
      .then((response) => sendResponse({ success: true, data: response }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }

  if (request.action === 'get_api_config') {
    getApiConfig()
      .then((config) => sendResponse({ success: true, config }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

/**
 * Send user input to backend worker for processing
 */
async function processUserInput(input) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: input,
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error processing user input:', error);
    throw error;
  }
}

/**
 * Get API configuration from storage
 */
async function getApiConfig() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['apiConfig'], (result) => {
      if (result.apiConfig) {
        resolve(result.apiConfig);
      } else {
        reject(new Error('API config not found'));
      }
    });
  });
}
