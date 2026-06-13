# Janhit API Documentation

## Base URL

```
https://janhit.example.com
```

## Endpoints

### 1. Speech-to-Text

**Endpoint:** `POST /api/transcribe`

Convert audio to text using Sarvam AI Saaras V3.

**Request:**
```
Content-Type: multipart/form-data

- audio: File (WAV, MP3)
- language: string (optional, default: "en")
```

**Response:**
```json
{
  "success": true,
  "transcript": "I want to complain about broken streetlights",
  "language": "en",
  "confidence": 0.95
}
```

---

### 2. AI Processing

**Endpoint:** `POST /api/process`

Analyze user input and detect intent using Gemini 2.5 Flash.

**Request:**
```json
{
  "transcript": "I want to file a complaint about water supply",
  "context": {}
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "intent": "municipal_complaint",
    "confidence": 0.95,
    "entities": {
      "complaint_type": "water_supply"
    },
    "nextQuestion": "Which area of the city is affected?",
    "workflow": "municipal_grievance"
  }
}
```

---

### 3. Form Generation

**Endpoint:** `POST /api/generate-form`

Generate a form draft based on collected information.

**Request:**
```json
{
  "intent": "municipal_complaint",
  "data": {
    "complaint_type": "water_supply",
    "location": "Main Street, Sector 5",
    "description": "No water supply for 3 days"
  }
}
```

**Response:**
```json
{
  "success": true,
  "form": {
    "title": "Municipal Complaint Form",
    "fields": [...],
    "draft": "Formal complaint text..."
  }
}
```

---

### 4. Text-to-Speech

**Endpoint:** `POST /api/synthesize`

Convert text to speech using Sarvam AI Bulbul V3.

**Request:**
```json
{
  "text": "Your complaint has been recorded successfully",
  "language": "en"
}
```

**Response:**
```json
{
  "success": true,
  "audio_url": "data:audio/wav;base64,...",
  "language": "en"
}
```

---

## Error Handling

All endpoints return error responses in this format:

```json
{
  "success": false,
  "error": "Error type",
  "message": "Detailed error message"
}
```

HTTP Status Codes:
- `200`: Success
- `400`: Bad request
- `401`: Unauthorized
- `404`: Not found
- `500`: Server error

---

## Authentication

API calls include:
- CORS headers for browser requests
- Optional API key header (to be implemented)

---

## Rate Limiting

- 100 requests per minute per IP
- 1000 requests per day per user

---

## Environment Variables

```
WORKER_URL: Worker deployment URL
GEMINI_API_KEY: Google Gemini API key
SARVAM_API_KEY: Sarvam AI API key
```
