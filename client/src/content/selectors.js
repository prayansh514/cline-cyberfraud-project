// Steps 53 and 53a: every DOM selector the content script uses lives in this file.
//
// STATUS LEGEND (read this before trusting a selector on live WhatsApp Web):
//   [mock]  matches the local mock page (mock/whatsapp-mock.html). Verified by the Phase 7 checks.
//   [live?] a candidate for live WhatsApp Web. NOT verified. WhatsApp class names are obfuscated and change
//           without notice, so Phase 14 (Steps 100 to 102) must re-check every one of these in DevTools.
//
// Selectors are plain strings so they can be passed straight to querySelector / querySelectorAll / matches /
// closest. Step 102 will extend them (comma-joined) with the verified live selectors and keep the mock ones as a fallback.

// Chat pane (the scrollable message list), tried in order. The first match wins.
export const CHAT_PANE_SELECTORS = ['[role="application"]', '#main']

// Incoming message row. Combined [mock] and [live]. 
export const INCOMING_ROW = '.message-in, div[data-testid="msg-container"]'

// Outgoing message row. The scanner must IGNORE these.
// We use the :has() pseudo-class to identify live msg-containers that have the outgoing tail.
export const OUTGOING_ROW = '.message-out, div[data-testid="msg-container"]:has([data-testid="tail-out"])'

// The message bubble: the box the red/amber outline and the warning banner go on. 
export const BUBBLE = '.bubble, div[data-testid="msg-container"]'

// The element that holds the message text. Combined [mock] and [live].
export const MESSAGE_TEXT = 'span.selectable-text, span[data-testid="selectable-text"]'

// Container carrying the "[time, date] Sender: " attribute for anonymization.
export const PRE_PLAIN_TEXT = '[data-pre-plain-text]'

// ---- File attachments (Step 53a) ----
// Live selectors still UNKNOWN until you test a live APK in Step 104a.
export const ATTACHMENT_CONTAINER = '.document-attachment'
export const ATTACHMENT_FILENAME = '.attachment-filename'
export const ATTACHMENT_DOWNLOAD = 'a.attachment-download'