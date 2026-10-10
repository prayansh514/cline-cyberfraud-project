// Phase 7: DOM scanner.
//   Step 54  : isIncoming(node), extractMessageText(node)
//   Step 54a : attachment bubbles use the FILE NAME as the message text
//   Step 55  : initial pass over the messages already on the page
//   Step 56  : MutationObserver for new messages
//   Step 57  : de-duplication (processed attribute + a Set of message hashes)
//   Step 58  : batching (about 150 ms) so a burst does not freeze the page
//   Step 59  : wait for the chat pane when it does not exist yet (and re-attach if it is replaced)
//
// Only DOM text is read. Attachment contents and links are never fetched or opened.
import {
  CHAT_PANE_SELECTORS,
  INCOMING_ROW,
  OUTGOING_ROW,
  MESSAGE_TEXT,
  ATTACHMENT_CONTAINER,
  ATTACHMENT_FILENAME,
} from './selectors.js'

export const PROCESSED_ATTR = 'data-scamguard-processed'
export const BATCH_MS = 150

function clean(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

// True for an incoming message row (or anything inside one). Outgoing rows are always false.
export function isIncoming(node) {
  if (!node || typeof node.matches !== 'function' || typeof node.closest !== 'function') return false
  if (node.closest(OUTGOING_ROW)) return false
  return node.matches(INCOMING_ROW) || node.closest(INCOMING_ROW) !== null
}

// Returns the text to analyse for a message row, or an empty string (never null or undefined, never throws).
//   text bubble                  -> the message text
//   attachment bubble (Step 54a) -> the file name, for example "SBI_Rewards_Update.apk"
//   caption + attachment         -> caption and file name joined by one space
export function extractMessageText(node) {
  try {
    if (!node || typeof node.querySelector !== 'function') return ''
    const parts = []

    const caption = clean(node.querySelector(MESSAGE_TEXT)?.textContent)
    if (caption) parts.push(caption)

    const attachment = node.querySelector(ATTACHMENT_CONTAINER)
    if (attachment) {
      const nameEl = attachment.querySelector(ATTACHMENT_FILENAME)
      const name = clean(nameEl?.textContent) || clean(nameEl?.getAttribute?.('title'))
      if (name) parts.push(name)
    }

    return parts.join(' ')
  } catch {
    return ''
  }
}

// Fast, dependency-free 53-bit string hash (cyrb53). Collisions are negligible for chat-sized inputs.
export function hashText(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i += 1) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)
}

function findChatPane() {
  for (const selector of CHAT_PANE_SELECTORS) {
    const el = document.querySelector(selector)
    if (el) return el
  }
  return null
}

// Starts scanning. Handlers receive (row, text, hash):
//   onMessage   : first time this text is seen
//   onDuplicate : a new node whose text was already seen (for example WhatsApp re-created the bubble)
// Returns { stop, scanNow }.
// isEnabled() is asked before every message. While it returns false nothing is read and nothing is marked processed,
// so those messages can still be scanned later (call scanNow() when ScamGuard is turned back on).
export function startScanner({ onMessage, onDuplicate, isEnabled = () => true } = {}) {
  const seen = new Set()
  const pending = new Set()
  let pane = null
  let paneObserver = null
  let rootObserver = null
  let batchTimer = null
  let paneCheckTimer = null
  let stopped = false

  function safeCall(handler, row, text, hash) {
    try {
      handler?.(row, text, hash)
    } catch (err) {
      console.error('[ScamGuard] handler error:', err?.message ?? err)
    }
  }

  function processRow(row) {
    if (stopped || !row || row.hasAttribute?.(PROCESSED_ATTR)) return
    if (!row.matches?.(INCOMING_ROW) || !isIncoming(row)) return
    if (!isEnabled()) return
    const text = extractMessageText(row)
    if (!text) return // nothing to read yet; a later mutation inside this row will try again
    row.setAttribute(PROCESSED_ATTR, '1')
    const hash = hashText(text)
    if (seen.has(hash)) {
      safeCall(onDuplicate, row, text, hash)
      return
    }
    seen.add(hash)
    safeCall(onMessage, row, text, hash)
  }

  // Step 55: scan whatever is already on the page, in document order.
  function scanNow() {
    if (!pane) return
    pane.querySelectorAll(INCOMING_ROW).forEach(processRow)
  }

  function rowsFor(node, rows) {
    const el = node.nodeType === 1 ? node : node.parentElement
    if (!el) return
    if (el.matches?.(INCOMING_ROW)) rows.add(el)
    el.querySelectorAll?.(INCOMING_ROW).forEach((r) => rows.add(r))
    const enclosing = el.closest?.(INCOMING_ROW)
    if (enclosing) rows.add(enclosing)
  }

  // Step 58: handle everything collected during the batch window in one pass, in document order.
  function flush() {
    batchTimer = null
    const nodes = [...pending]
    pending.clear()
    const rows = new Set()
    nodes.forEach((n) => rowsFor(n, rows))
    ;[...rows]
      .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
      .forEach(processRow)
  }

  // Step 56: collect added nodes, then process them after BATCH_MS.
  function onMutations(mutations) {
    if (stopped) return
    for (const m of mutations) m.addedNodes.forEach((n) => pending.add(n))
    if (pending.size > 0 && batchTimer === null) batchTimer = setTimeout(flush, BATCH_MS)
  }

  function attach(el) {
    pane = el
    paneObserver?.disconnect()
    paneObserver = new MutationObserver(onMutations)
    paneObserver.observe(el, { childList: true, subtree: true })
    scanNow()
  }

  // Step 59: attach now if the pane exists, otherwise keep watching the page until it appears.
  // Also re-attach if WhatsApp replaces the pane (for example when switching chats).
  function ensurePane() {
    paneCheckTimer = null
    if (stopped || (pane && pane.isConnected)) return
    const found = findChatPane()
    if (found) attach(found)
    else pane = null
  }

  function schedulePaneCheck() {
    if (paneCheckTimer === null && !stopped) paneCheckTimer = setTimeout(ensurePane, 100)
  }

  rootObserver = new MutationObserver(() => {
    if (!pane || !pane.isConnected) schedulePaneCheck()
  })
  rootObserver.observe(document.documentElement, { childList: true, subtree: true })
  ensurePane()

  return {
    scanNow,
    stop() {
      stopped = true
      paneObserver?.disconnect()
      rootObserver?.disconnect()
      clearTimeout(batchTimer)
      clearTimeout(paneCheckTimer)
      pending.clear()
    },
  }
}
