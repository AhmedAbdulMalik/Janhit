# Janhit Architecture

## System Overview

Janhit is a distributed system consisting of three main components:

1. **Chrome Extension** - Client-side UI and interaction
2. **Cloudflare Worker** - Backend API and AI orchestration
3. **Third-party AI Services** - Speech, Language, and NLP

## Architecture Diagram

```
┌──────────────────────┐
│  Chrome Extension    │
│  ┌────────────────┐  │
│  │ Popup UI       │  │
│  │ Content Script │  │
│  │ Service Worker │  │
│  └────────────────┘  │
└──────────┬───────────┘
           │
           │ HTTPS
           ▼
┌──────────────────────────┐
│ Cloudflare Worker        │
│ ┌────────────────────┐   │
│ │ /api/transcribe    │   │
│ │ /api/process       │   │
│ │ /api/generate-form │   │
│ │ /api/synthesize    │   │
│ └────────────────────┘   │
└──────┬──────────┬────────┘
       │          │
       ▼          ▼
┌──────────┐  ┌──────────────┐
│ Sarvam   │  │ Google       │
│ AI APIs  │  │ Gemini API   │
│ STT/TTS  │  │ Reasoning    │
└──────────┘  └──────────────┘
```

## Data Flow

1. **User Voice Input** → Chrome Extension (Web Audio API)
2. **Audio Bytes** → Cloudflare Worker
3. **Transcription** → Sarvam Saaras V3
4. **Text** → Gemini 2.5 Flash (Intent Detection)
5. **Processing** → Workflow Engine
6. **Form Draft** → Client
7. **Response Text** → Sarvam Bulbul V3 (TTS)
8. **Audio** → User via Speaker

## Component Details

### Chrome Extension

- **popup/**: User-facing interface
- **content-scripts/**: DOM manipulation and form interaction
- **background/**: Service worker for API communication
- **utils/**: Helper modules (API client, storage, etc.)

### Cloudflare Worker

- **routes/**: API endpoint handlers
- **services/**: Business logic (workflow engine, form generation)
- **prompts/**: AI system prompts and workflow definitions
- **api/**: External API integrations

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML, CSS, JavaScript, Chrome APIs |
| Backend | Node.js, Cloudflare Workers |
| AI/ML | Gemini 2.5 Flash, Sarvam AI |
| Deployment | Cloudflare, Chrome Web Store |

## Security Considerations

- API keys stored in Cloudflare environment
- CORS headers configured appropriately
- No sensitive data stored locally
- HTTPS enforced for all communication
- Graceful error handling without exposing internals
