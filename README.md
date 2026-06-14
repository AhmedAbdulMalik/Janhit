# 🇮🇳 Janhit - AI Civic Assistant

> **Empowering Citizens Through AI**  
> Make civic action as easy as having a conversation.

**Janhit** is a multilingual, AI-powered Chrome Extension designed to bridge the digital divide between citizens and government services. Instead of manually navigating complex portals, deciphering bureaucratic terminology, or struggling with lengthy forms, users simply hold button and explain their issue in their native language. 

Janhit automatically identifies the correct procedure, asks for missing details, and autofills the appropriate forms directly in the browser.

---

##  Core Features

- ** Hold-to-Talk Interface**: Hold `Button`  on thePopup to speak naturally to the AI.
- ** Multilingual Voice Support**: Talk in local Indian languages (powered by Sarvam AI).
- ** AI Civic Navigation**: Automatically detects intent (e.g., Municipal Complaints, Banking Grievances) and identifies the correct public service procedure.
- ** DOM Interaction**: Automatically sees compatible form fields, clicks necessary buttons, and guides the user through web pages.
- ** Voice Feedback**: Provides spoken confirmations and asks conversational follow-up questions for missing details.
- ** Privacy First**: The extension holds zero Data. All intelligence is proxied securely through a Cloudflare Worker edge backend.

---

##  System Architecture

Janhit is built with a strict separation of concerns, ensuring high security and performance across the browser extension and the backend.

### Tech Stack
- **Frontend**: Chrome Extension (Manifest V3), Vanilla HTML/CSS/JS

- **Edge Backend**: Cloudflare Workers
- **Speech-to-Text (STT)**: Sarvam AI (Saaras V3)
- **Text-to-Speech (TTS)**: Sarvam AI (Bulbul V3)
- **AI Reasoning / Intent**: Google Gemini 2.5 Flash

### Data Flow
1. User holds `Button` on POP UP ➔ Content Script detects input.
2. Background Worker boots a hidden **Offscreen Document**.
3. Offscreen Document captures Web Audio and DOM context, Elements.
4. On release, raw audio streams directly to the **Cloudflare Worker**.
5. Worker translates Speech-to-Text (Sarvam).
6. Worker detects intent and extracts fields (Gemini).
7. Worker returns structured instructions (DOM actions, autofill data, or follow-up questions).
8. Extension triggers form autofills and text-to-speech feedback.

---

##  Installation & Setup

### Prerequisites
- Node.js (v20+)
- Google Chrome browser
- API Keys: Google Gemini, Sarvam AI
- Cloudflare account (for deploying the worker)

### 1. Setup the Cloudflare Worker Backend
Navigate to the worker directory and install dependencies (if any), then configure your environment variables.

```bash
cd src/worker
npm install wrangler --save-dev
```

Create a `.dev.vars` file in the `src/worker` directory for local development:
```env
GEMINI_API_KEY="your_gemini_key_here"
SARVAM_API_KEY="your_sarvam_key_here"
```

Start the local development server:
```bash
npx wrangler dev
```
*Note: Update the API URL in `src/extension/background/service-worker.js` and `src/extension/offscreen/audio.js` to point to your local worker (`http://127.0.0.1:8787`) during development.*

### 2. Load the Chrome Extension
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Toggle **Developer mode** on in the top right corner.
3. Click **Load unpacked**.
4. Select the `src/extension` folder from this repository.

---

##  Usage

1. Navigate to a Any portal or Website .
2. Hold Botton to activate Janhit's microphone.
3. Speak your Any Languague clearly .
4. Release Button.
5. Janhit will process your request, respond with voice feedback, and automatically begin filling out the relevant fields on the page.

---

**Hackathon Track:** Open Innovation 

**Parterned Track:** Sarvam AI, Gemini API

*Designed for high accessibility, low digital literacy barriers, and frictionless public service navigation.*