// Phase 8: local, privacy-first pre-filter. Runs in the browser BEFORE anything is sent anywhere.
// A message that matches none of these rules is ignored and never leaves the page.
//
// Pure JavaScript: no chrome.* and no DOM APIs, so it also runs in Node (unit tests).
//   Step 61  : shouldAnalyze(text) -> { flagged, reasons }
//   Step 62  : URL rule
//   Step 63  : financial / urgency keyword rule
//   Step 63a : .apk file extension rule
//   Step 64  : unknown phone number rule

// Step 62: http(s) links, www. links, and bare domains on well-known URL shorteners.
const SHORTENER_DOMAINS = [
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'cutt.ly', 'rb.gy', 'shorturl.at', 'ow.ly', 'buff.ly',
  'rebrand.ly', 'tiny.cc', 'bl.ink', 'wa.me',
]
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const URL_RE = new RegExp(
  '(?:\\bhttps?:\\/\\/\\S+|\\bwww\\.[a-z0-9-]+(?:\\.[a-z0-9-]+)+\\S*|\\b(?:' +
    SHORTENER_DOMAINS.map(escapeRe).join('|') +
    ')\\/\\S+)',
  'i',
)

// Step 63: financial and urgency keywords. Word boundaries stop "company" from matching "pan".
// Plain words are matched as whole words; multi-word phrases tolerate extra spaces.
const KEYWORDS = [
  'upi', 'kyc', 'otp', 'bank', 'account blocked', 'refund', 'lottery', 'prize', 'urgent', 'verify', 'pan',
  'aadhaar', 'cvv',
]
const KEYWORD_RE = new RegExp(
  '\\b(?:' + KEYWORDS.map((k) => escapeRe(k).replace(/\s+/g, '\\s+')).join('|') + ')\\b',
  'i',
)

// Step 63a: the .apk extension. Not followed by another letter or digit, so ".apkg" and ".apk1" do not match.
const APK_EXT_RE = /\.apk(?![a-z0-9])/i
// ...and the standalone word "apk", so "install this APK file" is caught too.
const APK_WORD_RE = /\bapk\b/i

// Step 64: Indian mobile numbers: optional +91 / 91 / 0 prefix, then 10 digits starting 6-9, with optional single
// spaces or dashes inside. A 4-digit number such as a room number never matches.
const PHONE_RE = /(?<![\d])(?:(?:\+|00)?91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?![\d])/
const PHONE_SPACED_RE = /(?<![\d])(?:(?:\+|00)?91[\s-]?)?[6-9]\d{3,4}[\s-]\d{2,3}[\s-]?\d{2,5}(?![\d])/

export const REASONS = Object.freeze({
  URL: 'url',
  KEYWORD: 'keyword',
  APK: 'apk-file',
  PHONE: 'phone-number',
})

function hasPhone(text) {
  if (PHONE_RE.test(text)) return true
  const m = text.match(PHONE_SPACED_RE)
  if (!m) return false
  return m[0].replace(/\D/g, '').replace(/^(?:00)?91/, '').length === 10
}

// Returns { flagged: boolean, reasons: string[] }. Never throws.
export function shouldAnalyze(text) {
  const reasons = []
  if (typeof text !== 'string' || text.trim() === '') return { flagged: false, reasons }
  if (URL_RE.test(text)) reasons.push(REASONS.URL)
  if (KEYWORD_RE.test(text)) reasons.push(REASONS.KEYWORD)
  if (APK_EXT_RE.test(text) || APK_WORD_RE.test(text)) reasons.push(REASONS.APK)
  if (hasPhone(text)) reasons.push(REASONS.PHONE)
  return { flagged: reasons.length > 0, reasons }
}
