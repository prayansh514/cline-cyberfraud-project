// Step 23: tolerant parser for the forensic agent's reply.
// Accepts clean JSON, markdown-fenced JSON, or JSON surrounded by prose. Validates the verdict
// against the allowed values and falls back to Suspicious on any failure, so the API never crashes.

export const VERDICTS = ['Safe', 'Suspicious', 'Malicious'];

export const FALLBACK_VERDICT = Object.freeze({
  verdict: 'Suspicious',
  explanation: 'Unable to verify this message automatically. Treat it with caution.',
});

function stripCodeFences(text) {
  return text.replace(/```(?:json)?/gi, '').trim();
}

// Returns the first balanced {...} block, ignoring braces that appear inside strings.
function extractFirstJsonObject(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export function parseVerdict(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return { ...FALLBACK_VERDICT };
  try {
    const candidate = extractFirstJsonObject(stripCodeFences(raw));
    if (!candidate) return { ...FALLBACK_VERDICT };
    const parsed = JSON.parse(candidate);
    const verdict = VERDICTS.find((v) => v.toLowerCase() === String(parsed.verdict).trim().toLowerCase());
    if (!verdict) return { ...FALLBACK_VERDICT };
    const explanation =
      typeof parsed.explanation === 'string' && parsed.explanation.trim() !== ''
        ? parsed.explanation.trim()
        : FALLBACK_VERDICT.explanation;
    return { verdict, explanation };
  } catch {
    return { ...FALLBACK_VERDICT };
  }
}
