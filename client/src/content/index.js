import { startScanner } from './scanner.js'
import { shouldAnalyze } from './prefilter.js'
import { anonymize, parseSenderName } from './anonymize.js'
import { PRE_PLAIN_TEXT } from './selectors.js'
import { MESSAGES } from '../shared/config.js'
import { applyVerdict } from './intervene.js'
import { showBadge, removeBanner } from './banner.js'
import { getSettings, onSettingsChanged } from '../shared/settings.js'

console.log('ScamGuard active')

// The sender name comes from the "[time, date] Sender: " attribute. It is used only to mask that name in the text.
function senderNameOf(row) {
  return parseSenderName(row.querySelector(PRE_PLAIN_TEXT)?.getAttribute('data-pre-plain-text') ?? '')
}

// Privacy: by default the console never shows an original message. The Phase 7 and 8 checks need to see what was
// scanned, so that line is available behind an explicit debug switch (off by default). Turn it on from the page's
// DevTools console with:  localStorage.setItem('scamguard:debug', '1')  and reload.
function debugOriginalText() {
  try {
    return window.localStorage.getItem('scamguard:debug') === '1'
  } catch {
    return false
  }
}

// hash -> verdict, so a bubble that WhatsApp re-creates gets its warning back without another request (Step 85).
const verdictCache = new Map()
// hash -> rows still waiting for the verdict of a request that is already in flight.
const inflight = new Map()

// Step 91: count one event (scanned, flagged or blocked) in the service worker. Fire and forget: never throws.
function countStat(key) {
  if (invalidated || !contextValid()) return // counters are optional; never throw
  try {
    chrome.runtime.sendMessage({ type: MESSAGES.STAT, key }, () => void chrome.runtime.lastError)
  } catch {
    // extension reloaded or unavailable
  }
}

function showResult(row, hash, reply) {
  removeBanner(row) // Step 86: the "Checking..." badge always goes away, whatever the outcome
  if (reply?.ok && !reply.fallback) {
    console.log(`[ScamGuard] verdict: ${reply.verdict} ${reply.explanation}`)
    if (applyVerdict(row, reply) === 'Malicious') countStat('blocked')
  } else {
    // Step 94: the backend is down or slow, or its analysis failed (it then answers with a generic "Suspicious" fallback
    // that carries no real finding). Show a neutral badge: never a crash, never "Checking..." forever, and never a
    // scary or reassuring verdict that was not actually reached.
    const why = reply?.ok ? 'analysis failed on the server' : (reply?.error ?? 'no reply')
    console.log(`[ScamGuard] verdict unavailable: ${why}`)
    showBadge(row, 'Unverified')
  }
}

// Step 99: when the extension is reloaded or updated, the content script already running in an open tab is orphaned:
// chrome.runtime.id becomes undefined and every chrome.* call throws "Extension context invalidated". Detect that, stop
// every observer and listener, and say so ONCE. Reloading the tab then starts a fresh, working content script.
let invalidated = false
let unsubscribeSettings = null

function contextValid() {
  try {
    return Boolean(chrome.runtime?.id)
  } catch {
    return false
  }
}

function shutdown() {
  if (invalidated) return
  invalidated = true
  scanner?.stop()
  unsubscribeSettings?.()
  inflight.clear()
  console.log('[ScamGuard] extension was reloaded or updated: stopped. Reload this tab to turn ScamGuard back on.')
}

// Step 90: the on/off switch from the popup. Nothing is scanned while it is off.
let enabled = false
let scanner = null

function startScanning() {
  scanner = startScanner({
    isEnabled: () => {
      if (invalidated || !contextValid()) {
        shutdown()
        return false
      }
      return enabled
    },

    // A new node whose text we have already seen (WhatsApp re-created the bubble): reuse the verdict, no new request.
    onDuplicate: (row, text, hash) => {
      const cached = verdictCache.get(hash)
      if (cached) {
        applyVerdict(row, cached) // Step 85: the warning comes straight back
      } else if (inflight.has(hash)) {
        inflight.get(hash).add(row) // the first request is still running: this row gets the same answer
        showBadge(row, 'Pending')
      }
    },

    onMessage: (row, text, hash) => {
      countStat('scanned')
      if (debugOriginalText()) console.log(`[ScamGuard] scanned: ${text}`)

      // Step 66: privacy-first pre-filter. Messages with no link, keyword, .apk or phone number are dropped here
      // and never leave the page. Flagged messages continue to the next step (anonymize, then analyse).
      const { flagged, reasons } = shouldAnalyze(text)
      if (!flagged) {
        console.log('[ScamGuard] skipped (safe)')
        return
      }
      console.log(`[ScamGuard] flagged: ${reasons.join(', ')}`)
      countStat('flagged')

      // Steps 67 to 72: mask personal details, and log ONLY the anonymized text that would be sent.
      const payload = anonymize(text, { senderName: senderNameOf(row) })
      console.log(`[ScamGuard] payload: ${payload}`)

      // Steps 74 to 76: hand the anonymized text to the service worker and log the verdict that comes back.
      inflight.set(hash, new Set([row]))
      showBadge(row, 'Pending') // Step 86: "Checking..." until the verdict arrives
      requestVerdict(payload).then((reply) => {
        const rows = inflight.get(hash) ?? new Set([row])
        inflight.delete(hash)
        if (reply?.ok && !reply.fallback) verdictCache.set(hash, reply)
        for (const r of rows) showResult(r, hash, reply)
      })
    },
  })
}

// Read the saved setting first, so a disabled ScamGuard never does even the initial scan.
getSettings().then((settings) => {
  enabled = settings.enabled
  startScanning()
  console.log(`[ScamGuard] ${enabled ? 'on' : 'off'}`)
  unsubscribeSettings = onSettingsChanged((next) => {
    const wasEnabled = enabled
    enabled = next.enabled
    console.log(`[ScamGuard] ${enabled ? 'on' : 'off'}`)
    // Turned back on: pick up messages that arrived while it was off.
    if (enabled && !wasEnabled) scanner?.scanNow()
  })
})

// Step 74: send { type: 'ANALYZE', text } to the service worker. Resolves with { ok, verdict, explanation } or
// { ok: false, error }. Never rejects, so a stopped backend or a reloaded extension cannot throw in the page.
function requestVerdict(text) {
  return new Promise((resolve) => {
    if (invalidated || !contextValid()) {
      shutdown()
      resolve({ ok: false, error: 'extension was reloaded' })
      return
    }
    try {
      chrome.runtime.sendMessage({ type: MESSAGES.ANALYZE, text }, (reply) => {
        const lastError = chrome.runtime.lastError
        resolve(lastError ? { ok: false, error: lastError.message } : reply)
      })
    } catch (err) {
      // "Extension context invalidated" can still be thrown if the reload happens between the check and the call.
      if (!contextValid()) shutdown()
      resolve({ ok: false, error: err?.message ?? 'sendMessage failed' })
    }
  })
}
