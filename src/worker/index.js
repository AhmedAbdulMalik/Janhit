// c:\Users\iyand\Downloads\Janhit\src\worker\index.js

export default {
  async fetch(request, env, ctx) {
    // CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
        }
      });
    }

    const url = new URL(request.url);

    // Route: STT Processor
    if (request.method === 'POST' && url.pathname === '/api/transcribe') {
      try {
        const formData = await request.formData();
        const audioFile = formData.get('audio');

        if (!audioFile) {
          return new Response(JSON.stringify({ error: 'No audio provided' }), { status: 400 });
        }

        // Forward Multipart directly to Sarvam
        const sarvamPayload = new FormData();
        sarvamPayload.append('file', audioFile);
        sarvamPayload.append('model', 'saaras:v3');

        const sarvamResponse = await fetch('https://api.sarvam.ai/speech-to-text', {
          method: 'POST',
          headers: {
            'api-subscription-key': env.SARVAM_API_KEY
          },
          body: sarvamPayload
        });

        if (!sarvamResponse.ok) {
          throw new Error(`Sarvam API Error: ${sarvamResponse.status}`);
        }

        const transcriptData = await sarvamResponse.json();

        // Future: Pipe `transcriptData.text` to Gemini logic here before returning
        return new Response(JSON.stringify({ success: true, text: transcriptData }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
      }
    }
  }
};