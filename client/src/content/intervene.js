// Phase 11: visual intervention on a message bubble.
//   Step 79 : applyVerdict(row, { verdict, explanation })      (Safe changes nothing)
//   Step 80 : red outline for Malicious
//   Step 81 : links and download controls in a Malicious bubble are disabled
//   Step 83 : Suspicious = amber outline, links stay clickable but ask for confirmation
//
// Everything this module adds to WhatsApp's own elements is namespaced (data-scamguard-* attributes and two inline
// style properties) and is fully undone by clearIntervention(), so a bubble can always be returned to its original state.
import { ATTACHMENT_CONTAINER, ATTACHMENT_DOWNLOAD, BUBBLE } from './selectors.js'
import { BANNER_ATTR, removeBanner, showBanner } from './banner.js'

export const VERDICT_ATTR = 'data-scamguard-verdict'
export const DISMISSED_ATTR = 'data-scamguard-dismissed'
export { BANNER_ATTR }
const HREF_ATTR = 'data-scamguard-href'
const DOWNLOAD_ATTR = 'data-scamguard-download'

const OUTLINE_COLOURS = { Malicious: '#dc2626', Suspicious: '#f59e0b' }

// bubble -> { handler, events } for the listeners we attached, so clearIntervention can remove exactly those.
const installed = new WeakMap()

export function bubbleOf(row) {
  return row?.querySelector?.(BUBBLE) ?? row
}

// Anything that is not one of the three known verdicts is treated as Suspicious (the safer reading).
export function normalizeVerdict(verdict) {
  const v = String(verdict ?? '').trim().toLowerCase()
  if (v === 'safe') return 'Safe'
  if (v === 'malicious') return 'Malicious'
  return 'Suspicious'
}

// True when the event came from our own banner (inside its shadow root), which must keep working.
function fromBanner(event) {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : []
  return path.some((n) => n?.hasAttribute?.(BANNER_ATTR))
}

function eventElement(event) {
  const first = typeof event.composedPath === 'function' ? event.composedPath()[0] : event.target
  if (first instanceof Element) return first
  return first?.parentElement ?? null
}

// ---- Malicious: disable links and download controls (Step 81) ----
function neutraliseLinks(bubble) {
  for (const a of bubble.querySelectorAll('a[href]')) {
    a.setAttribute(HREF_ATTR, a.getAttribute('href'))
    a.removeAttribute('href')
    a.style.pointerEvents = 'none'
    a.setAttribute('aria-disabled', 'true')
  }
  for (const el of bubble.querySelectorAll(`${ATTACHMENT_DOWNLOAD}[download], [${DOWNLOAD_ATTR}]`)) {
    if (el.hasAttribute('download')) {
      el.setAttribute(DOWNLOAD_ATTR, el.getAttribute('download'))
      el.removeAttribute('download')
    }
    el.style.pointerEvents = 'none'
  }
}

function restoreLinks(bubble) {
  for (const a of bubble.querySelectorAll(`[${HREF_ATTR}]`)) {
    a.setAttribute('href', a.getAttribute(HREF_ATTR))
    a.removeAttribute(HREF_ATTR)
    a.style.pointerEvents = ''
    a.removeAttribute('aria-disabled')
  }
  for (const el of bubble.querySelectorAll(`[${DOWNLOAD_ATTR}]`)) {
    el.setAttribute('download', el.getAttribute(DOWNLOAD_ATTR))
    el.removeAttribute(DOWNLOAD_ATTR)
    el.style.pointerEvents = ''
  }
}

// Capturing handler: swallows clicks and middle-clicks on links, the attachment box and the download control.
// pointer-events:none on the anchors lets a click fall through to the element underneath, which is why the
// attachment container is blocked too (on WhatsApp the whole document box starts a download).
function blockHandler(event) {
  if (fromBanner(event)) return
  const el = eventElement(event)
  if (!el?.closest(`a, ${ATTACHMENT_CONTAINER}, ${ATTACHMENT_DOWNLOAD}`)) return
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
}

// ---- Suspicious: links stay clickable but ask first (Step 83) ----
function confirmHandler(event) {
  if (fromBanner(event)) return
  const el = eventElement(event)
  if (!el?.closest('a[href]')) return
  const ok = window.confirm('ScamGuard: this message looks suspicious. Open this link anyway?')
  if (!ok) {
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
  }
}

function listen(bubble, handler) {
  const events = ['click', 'auxclick']
  for (const type of events) bubble.addEventListener(type, handler, true)
  installed.set(bubble, { handler, events })
}

// Removes every effect applyVerdict or showPending had on this row. Safe to call on a clean row.
export function clearIntervention(row) {
  const bubble = bubbleOf(row)
  if (!bubble) return
  const listeners = installed.get(bubble)
  if (listeners) {
    for (const type of listeners.events) bubble.removeEventListener(type, listeners.handler, true)
    installed.delete(bubble)
  }
  restoreLinks(bubble)
  bubble.style.removeProperty('outline')
  bubble.style.removeProperty('outline-offset')
  bubble.removeAttribute(VERDICT_ATTR)
  removeBanner(row)
}

// Step 84: the user dismissed the warning for this one message. Everything is undone and the row is remembered as
// dismissed, so a later verdict for the same node does not bring the warning back.
export function dismiss(row) {
  clearIntervention(row)
  row?.setAttribute?.(DISMISSED_ATTR, '1')
}

// Applies a verdict to a message row. Safe leaves the bubble untouched. Returns the normalized verdict.
export function applyVerdict(row, result = {}, options = {}) {
  if (!row || row.hasAttribute?.(DISMISSED_ATTR)) return null
  clearIntervention(row)
  const verdict = normalizeVerdict(result.verdict)
  if (verdict === 'Safe') return verdict

  const bubble = bubbleOf(row)
  bubble.setAttribute(VERDICT_ATTR, verdict)
  bubble.style.setProperty('outline', `3px solid ${OUTLINE_COLOURS[verdict]}`)
  bubble.style.setProperty('outline-offset', '2px')

  if (verdict === 'Malicious') {
    neutraliseLinks(bubble)
    listen(bubble, blockHandler)
  } else {
    listen(bubble, confirmHandler)
  }
  // Steps 82 and 83: the explanation banner (Malicious: red, Suspicious: amber) with a Dismiss button.
  showBanner(row, { verdict, explanation: result.explanation }, {
    onDismiss: (r) => {
      dismiss(r)
      options.onDismiss?.(r)
    },
  })
  return verdict
}
