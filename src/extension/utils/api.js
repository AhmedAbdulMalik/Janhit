// c:\Users\iyand\Downloads\Janhit\src\extension\utils\api.js

/**
 * API utility module for Janhit extension
 * Handles communication with backend worker
 */

class JanhitAPI {
  constructor(baseUrl = null) {
    this.baseUrl = baseUrl || 'https://janhit.example.com';
    this.timeout = 30000; // 30 seconds
  }

  /**
   * Send audio transcription request
   */
  async transcribeAudio(audioBlob, language = 'en') {
    const formData = new FormData();
    formData.append('audio', audioBlob);
    formData.append('language', language);

    return this.post('/api/transcribe', formData);
  }

  /**
   * Send transcript for AI processing
   */
  async processTranscript(transcript, context = {}) {
    return this.post('/api/process', {
      transcript,
      context,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Generate form draft
   */
  async generateFormDraft(intent, collectedData = {}) {
    return this.post('/api/generate-form', {
      intent,
      data: collectedData,
    });
  }

  /**
   * Get text-to-speech response
   */
  async synthesizeSpeech(text, language = 'en') {
    return this.post('/api/synthesize', {
      text,
      language,
    });
  }

  /**
   * Generic POST request
   */
  async post(endpoint, data) {
    try {
      const headers = {
        'Content-Type': data instanceof FormData ? undefined : 'application/json',
      };

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: Object.fromEntries(Object.entries(headers).filter(([_, v]) => v !== undefined)),
        body: data instanceof FormData ? data : JSON.stringify(data),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Error calling ${endpoint}:`, error);
      throw error;
    }
  }

  /**
   * Generic GET request
   */
  async get(endpoint) {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'GET',
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Error calling ${endpoint}:`, error);
      throw error;
    }
  }
}

// Export for use in extension
if (typeof module !== 'undefined' && module.exports) {
  module.exports = JanhitAPI;
}
