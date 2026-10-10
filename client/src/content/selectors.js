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
//   '[role="application"]'  [mock]  also a [live?] candidate for the WhatsApp message list.
//   '#main'                 [live?] WhatsApp's conversation column, used when the first selector finds nothing.
export const CHAT_PANE_SELECTORS = ['[role="application"]', '#main']

// Incoming message row. [mock]. `div.message-in` is also a [live?] candidate (historically used by WhatsApp Web).
export const INCOMING_ROW = '.message-in'

// Outgoing message row. The scanner must IGNORE these. [mock] and [live?], same caveat as above.
export const OUTGOING_ROW = '.message-out'

// The message bubble: the box the red/amber outline and the warning banner go on. [mock]. [live?] unverified.
// If it is not found inside a row, the intervention falls back to the row itself.
export const BUBBLE = '.bubble'

// The element that holds the message text. [mock] and [live?] (`span.selectable-text` has long been used by WhatsApp).
export const MESSAGE_TEXT = 'span.selectable-text'

// Container carrying the "[time, date] Sender: " attribute, used later to learn the sender name for anonymizing. [mock], [live?].
export const PRE_PLAIN_TEXT = '[data-pre-plain-text]'

// ---- File attachments (Step 53a) ----

// Attachment container inside a message row. [mock only]. Live selector UNKNOWN until Step 101.
//   Hypothesis to test in DevTools, not to trust: an element found through a `data-icon` attribute on the document
//   icon, then walking up to the bubble.
export const ATTACHMENT_CONTAINER = '.document-attachment'

// Element that shows the file name, for example "SBI_Rewards_Update.apk". [mock only]. Live selector UNKNOWN until Step 101.
//   Hypothesis: the element with a `title` attribute holding the file name, or the visible text beside the icon.
export const ATTACHMENT_FILENAME = '.attachment-filename'

// Download control the extension disables on a Malicious attachment. [mock only]. Live selector UNKNOWN until Step 101.
//   Hypothesis: a `role="button"` element with a `title` attribute.
export const ATTACHMENT_DOWNLOAD = 'a.attachment-download'
