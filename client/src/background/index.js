// Service worker (Manifest V3). It talks to the backend on behalf of the content script, so the page never
// makes cross-origin requests itself (no CORS or mixed-content problems on WhatsApp Web).
//
//   Step 74 : message protocol  { type: 'ANALYZE', text }  ->  { ok, verdict, explanation }
//   Step 75 : POST {API_URL}/api/analyze with a 15 s AbortController timeout
import { HEALTH_TIMEOUT_MS, MESSAGES, REQUEST_TIMEOUT_MS } from '../shared/config.js'
import { DEFAULT_STATS, STAT_KEYS, getSettings } from '../shared/settings.js'
import { chromeSessionStore, createVerdictCache, sha256Hex } from './cache.js'
import { MAX_CONCURRENT_REQUESTS, createLimiter, createSingleFlight } from './limiter.js'

console.log('ScamGuard background ready')

// Step 95: verdicts already received, keyed by the SHA-256 of the anonymized text.
const verdictCache = createVerdictCache(chromeSessionStore())
// Step 96: at most 3 requests to the backend at once; the rest wait their turn.
const limiter = createLimiter(MAX_CONCURRENT_REQUESTS, {
  onChange: ({ active, queued }) => console.log(`[ScamGuard BG] in flight=${active} queued=${queued}`),
})
// Two identical messages that arrive together share one request.
const singleFlight = createSingleFlight()

// Step 91: counters live in chrome.storage.local. Increments are queued one after another so two quick events can
// never overwrite each other (each one reads the value the previous one wrote).
let statQueue = Promise.resolve()
function bumpStat(key) {
  if (!STAT_KEYS.includes(key)) return
  statQueue = statQueue
    .then(async () => {
      const stored = await chrome.storage.local.get(DEFAULT_STATS)
      await chrome.storage.local.set({ [key]: (Number(stored[key]) || 0) + 1 })
    })
    .catch((err) => console.log(`[ScamGuard BG] stat failed: ${err?.message ?? err}`))
}

// Step 92: GET {API_URL}/api/health. Resolves to { ok: true, status } or { ok: false, error }. Never rejects.
async function checkHealth() {
  const { apiUrl } = await getSettings()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)
  try {
    const res = await fetch(`${apiUrl}/api/health`, { signal: controller.signal })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const data = await res.json()
    return { ok: true, status: data?.status ?? 'ok' }
  } catch (err) {
    return { ok: false, error: err?.name === 'AbortError' ? 'timed out' : 'unreachable' }
  } finally {
    clearTimeout(timer)
  }
}

// Steps 95 and 96: the public entry point. Order: turned off? -> cache -> (shared, rate-limited) network request -> cache.
async function analyzeMessage(text) {
  const { enabled } = await getSettings()
  if (!enabled) return { ok: false, error: 'ScamGuard is turned off' }

  const hash = await sha256Hex(text)
  const cached = await verdictCache.get(hash)
  if (cached) {
    console.log('[ScamGuard BG] cache hit (no request sent)')
    return { ok: true, verdict: cached.verdict, explanation: cached.explanation, fallback: false, cached: true }
  }

  return singleFlight(hash, async () => {
    const reply = await limiter.run(() => analyzeWithBackend(text))
    // Only a real verdict is cached: never a failure, never the server's generic fallback.
    if (reply.ok && !reply.fallback) await verdictCache.set(hash, reply)
    return reply
  })
}

// Step 75: one request to the backend. Resolves to { ok: true, verdict, explanation } or { ok: false, error }. Never rejects.
async function analyzeWithBackend(text) {
  const { apiUrl } = await getSettings()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(`${apiUrl.replace(/\/+$/, '')}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    })
    if (!res.ok) return { ok: false, error: `Backend returned HTTP ${res.status}` }
    const data = await res.json()
    if (typeof data?.verdict !== 'string') return { ok: false, error: 'Backend reply had no verdict' }
    console.log(`[ScamGuard BG] verdict=${data.verdict}${data.error ? ' (fallback)' : ''}`)
    return { ok: true, verdict: data.verdict, explanation: data.explanation ?? '', fallback: data.error === true }
  } catch (err) {
    const reason = err?.name === 'AbortError' ? `timed out after ${REQUEST_TIMEOUT_MS} ms` : (err?.message ?? 'request failed')
    console.log(`[ScamGuard BG] request failed: ${reason}`)
    return { ok: false, error: reason }
  } finally {
    clearTimeout(timer)
  }
}

// Step 74: the content script sends { type: 'ANALYZE', text }. The reply is asynchronous, so the listener
// must return true to keep the message channel open until sendResponse is called.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === MESSAGES.HEALTH) {
    checkHealth().then(sendResponse)
    return true
  }
  if (message?.type === MESSAGES.STAT) {
    bumpStat(message.key)
    return false
  }
  if (message?.type !== MESSAGES.ANALYZE) return false
  const text = typeof message.text === 'string' ? message.text : ''
  console.log(`[ScamGuard BG] ANALYZE received len=${text.length}`)
  if (text === '') {
    sendResponse({ ok: false, error: 'Empty text' })
    return false
  }
  analyzeMessage(text).then(sendResponse)
  return true
})
