// Shared constants, imported by the content script, the service worker and the popup.
// Plain JavaScript: no chrome.* calls and no DOM access, so every context (and Node tests) can import it.

// Backend base URL. The popup can override it later (Step 89); this is the default.
export const DEFAULT_API_URL = 'http://localhost:5000'

// The three verdicts the backend returns.
export const VERDICTS = Object.freeze({
  SAFE: 'Safe',
  SUSPICIOUS: 'Suspicious',
  MALICIOUS: 'Malicious',
})

// Messages between the content script and the service worker.
export const MESSAGES = Object.freeze({
  ANALYZE: 'ANALYZE', // content script -> service worker: { type, text } -> { ok, verdict, explanation }
  HEALTH: 'HEALTH', // popup -> service worker: { type } -> { ok, status, error }
  STAT: 'STAT', // content script -> service worker: { type, key } counts one event (scanned, flagged or blocked)
})

// How long the popup waits for /api/health before showing the backend as down.
export const HEALTH_TIMEOUT_MS = 3000

// Service worker -> backend request timeout (Step 75).
export const REQUEST_TIMEOUT_MS = 15000
