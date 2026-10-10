// Phase 9: data anonymization. Runs in the browser, on flagged messages only, BEFORE anything is sent to the backend.
// Pure JavaScript: no DOM and no chrome.* APIs, so it also runs in Node (unit tests).
//
//   Step 67 : anonymize(text, options) is a pure function; text with nothing sensitive comes back unchanged
//   Step 68 : [UPI], [EMAIL], [PHONE], [NUMBER]
//   Step 69 : [NAME] (sender name from data-pre-plain-text, and "Hi/Dear/Hello <Name>" greetings)
//   Step 70 : URLs stay intact (the backend needs them), but personal values in the query string become [REDACTED]

// ---- URLs (kept as they are, except for personal query values: Step 70) ----
// http(s) links, www. links, and bare domains that have a path (for example bit.ly/abc123).
const URL_RE = /(?:https?:\/\/|www\.)\S+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}\/\S*/gi
const TRAILING_PUNCT_RE = /[.,;:!?)\]}'"]+$/

// Query parameter names that normally carry a personal value.
const PERSONAL_PARAMS = [
  'token', 'id', 'uid', 'userid', 'user', 'phone', 'mobile', 'mob', 'msisdn', 'email', 'mail', 'name', 'account',
  'acct', 'acc', 'otp', 'session', 'sid', 'auth', 'key',
]
const PERSONAL_PARAM_RE = new RegExp('([?&](?:' + PERSONAL_PARAMS.join('|') + ')=)([^&#\\s]*)', 'gi')

function redactUrl(url) {
  return url.replace(PERSONAL_PARAM_RE, '$1[REDACTED]')
}

// ---- Step 68: contact details and long numbers ----
// UPI ID: name@bank handle with NO dot after the @ (so an email address is not taken for a UPI ID).
// This rule runs before the email rule.
const UPI_RE = /(?<![\w.-])[\w.-]{2,}@[a-z][a-z0-9]{1,}(?![\w-]|\.[a-z0-9])/gi
const EMAIL_RE = /(?<![\w.-])[\w.+-]+@(?:[a-z0-9-]+\.)+[a-z]{2,}(?![\w-])/gi
// Indian mobile number: optional +91 / 91 / 0 prefix, 10 digits starting 6-9, optional space or dash in the middle.
const PHONE_RE = /(?<!\d)(?:(?:\+|00)?91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/g
const PHONE_SPACED_RE = /(?<!\d)(?:(?:\+|00)?91[\s-]?)?[6-9]\d{3,4}[\s-]\d{2,3}[\s-]?\d{2,5}(?!\d)/g
// Account / card numbers: 9 to 19 digits, optionally grouped with single spaces or dashes.
const LONG_NUMBER_RE = /(?<!\d)\d(?:[ -]?\d){8,18}(?!\d)/g

function maskPhones(text) {
  const exact = text.replace(PHONE_RE, '[PHONE]')
  return exact.replace(PHONE_SPACED_RE, (m) => {
    const digits = m.replace(/\D/g, '').replace(/^(?:00)?91/, '')
    return digits.length === 10 ? '[PHONE]' : m
  })
}

// ---- Step 69: names ----
// Words that follow a greeting but are not a person ("Dear Customer").
const NOT_NAMES = new Set([
  'customer', 'customers', 'sir', 'madam', 'user', 'valued', 'member', 'friend', 'friends', 'team', 'all', 'everyone',
  'folks', 'guys', 'there', 'beneficiary', 'applicant', 'client', 'sirmadam', 'sir/madam',
])
const GREETING_RE =
  /\b(?:Hi|hi|HI|Hello|hello|HELLO|Hey|hey|Dear|dear|DEAR|Namaste|namaste)(\s+)((?:(?:Mr|Mrs|Ms|Dr|Shri|Smt|Sri)\.?\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/g

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// "[10:42, 10/10/2026] Rahul Sharma: " -> "Rahul Sharma". Returns '' if there is no usable name.
export function parseSenderName(prePlainText) {
  if (typeof prePlainText !== 'string') return ''
  const m = prePlainText.match(/^\s*\[[^\]]*\]\s*(.*?):\s*$/)
  return m ? m[1].trim() : ''
}

function maskSenderName(text, senderName) {
  const name = typeof senderName === 'string' ? senderName.trim() : ''
  // Skip empty names, very short names, and senders that are just a phone number (the phone rule handles those).
  if (name.length < 3 || /^[+\d\s()-]+$/.test(name)) return text
  const re = new RegExp('(?<![\\p{L}\\p{N}])' + escapeRe(name).replace(/\s+/g, '\\s+') + '(?![\\p{L}\\p{N}])', 'giu')
  return text.replace(re, '[NAME]')
}

function maskGreetingNames(text) {
  return text.replace(GREETING_RE, (whole, space, name) => {
    const firstWord = name.replace(/^(?:Mr|Mrs|Ms|Dr|Shri|Smt|Sri)\.?\s+/, '').split(/\s+/)[0].toLowerCase()
    if (NOT_NAMES.has(firstWord)) return whole
    return whole.slice(0, whole.length - name.length) + '[NAME]'
  })
}

function anonymizeSegment(text, senderName) {
  let out = text
  out = out.replace(UPI_RE, '[UPI]') // before the email rule
  out = out.replace(EMAIL_RE, '[EMAIL]')
  out = maskPhones(out)
  out = out.replace(LONG_NUMBER_RE, '[NUMBER]')
  out = maskSenderName(out, senderName)
  out = maskGreetingNames(out)
  return out
}

// Returns the anonymized text. Options: { senderName } (see parseSenderName). Never throws.
export function anonymize(text, { senderName = '' } = {}) {
  if (typeof text !== 'string' || text === '') return typeof text === 'string' ? text : ''
  try {
    let result = ''
    let last = 0
    for (const match of text.matchAll(URL_RE)) {
      let url = match[0]
      const trailing = url.match(TRAILING_PUNCT_RE)?.[0] ?? ''
      url = url.slice(0, url.length - trailing.length)
      result += anonymizeSegment(text.slice(last, match.index), senderName)
      result += redactUrl(url) + trailing
      last = match.index + match[0].length
    }
    result += anonymizeSegment(text.slice(last), senderName)
    return result
  } catch {
    // Fail closed: if anything goes wrong, send nothing that could be personal.
    return '[REDACTED]'
  }
}
