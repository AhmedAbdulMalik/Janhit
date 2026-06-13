# COPILOT RUNTIME & TOKEN OPTIMIZATION INSTRUCTIONS
# Path: ./copilot-instruction.md

## 1. CREDIT PRESERVATION & RAW CODE FIRST
- **Zero Conversational Fluff**: No pleasantries, greetings, or filler text. Lead directly with the markdown code block.
- **Strict Explanation Cap**: Maximum one short, punchy sentence below the code block. Explain only the architectural "why," never the "what."
- **Zero Truncation**: Never use placeholders like `// TODO`, `// ... rest of code`, or partial snippets. Output 100% complete files ready to run. 
- **Absolute File Identification**: Always specify the target, absolute workspace file path as a markdown comment on the very first line of the code block.

## 2. CHROME EXTENSION MANIFEST V3 COMPLIANCE
- **Asynchronous Lifecycles**: Every `chrome.runtime.sendMessage` and asynchronous event listener must be strictly wrapped inside `try/catch` blocks.
- **Channel Persistence**: Always return `true` immediately inside background service worker listeners (`chrome.runtime.onMessage.addListener`) to keep the data channel open for async `sendResponse` callbacks.
- **Audio Capture Lifespans**: Background service workers cannot access the DOM or hold persistent media recorders. You must route microphone audio capture through a dedicated **Offscreen Document** or an extension-accessible tab using the Web Audio API.

## 3. SARVAM AI GATEWAY ENGINE (`saaras:v3`)
- **Next.js 15 Server-Side Specs**: App Router endpoints (`/api/.../route.ts`) must enforce strictly typed asynchronous `NextRequest` and `NextResponse` payloads.
- **Sarvam Payload Blueprint**: Direct audio files via multipart/form-data to `https://sarvam.ai`. Force mandatory headers (`api-key`) and payload params: `model="saaras:v3"` and `mode="translate"`.
- **Early-Fail Integrity**: Validate upstream responses (`response.ok`) and verify status codes before executing content parses to avoid wasting downstream memory processing corrupted text strings.

## 4. STRICT TYPE CONTRACTS & SELECTORS
- **Zero Type Laxity**: Explicitly disallow the `any` keyword. All messages passing through `chrome.runtime` or external API pathways must conform to immutable, typed TypeScript `interfaces`.
- **Vanilla DOM Form Extraction**: Do not use massive heavy-weight field validation libraries inside content scripts. Use native, lightweight element indicators (`id`, `name`, `placeholder`, `aria-label`) to scan forms, and fire programmatic native input events (`dispatchEvent(new Event('input'))`) so modern web page layers (React/Vue) instantly save the auto-filled states.
