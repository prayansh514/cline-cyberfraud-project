/**
 * ScamGuard API contract: POST /api/analyze
 *
 * Request body (JSON):
 *   { "text": "<anonymized message>" }
 *
 * Response body (JSON):
 *   {
 *     "verdict": "Safe" | "Suspicious" | "Malicious",
 *     "explanation": "<short reason>"
 *   }
 *
 * Errors: HTTP 400 with { "error": "<message>" } for invalid input.
 */
import { Router } from 'express';
import { analyzeMessage } from '../agent/forensicAgent.js';
import { FALLBACK_VERDICT } from '../agent/parseVerdict.js';

const router = Router();

const MAX_TEXT_LENGTH = 2000;

// Step 14: validate the request body. Missing, non-string, empty or oversized text returns HTTP 400.
function validateBody(req, res, next) {
  const text = req.body?.text;
  if (typeof text !== 'string') {
    return res.status(400).json({ error: '"text" is required and must be a string' });
  }
  if (text.trim().length === 0) {
    return res.status(400).json({ error: '"text" must not be empty' });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return res.status(400).json({ error: `"text" must be at most ${MAX_TEXT_LENGTH} characters` });
  }
  next();
}

// Step 15: deterministic stub so the extension can be tested without an LLM key.
// `lottery` or `.apk` => Malicious, `kyc` => Suspicious, anything else => Safe.
// Used when USE_STUB=true (offline demos).
function stubVerdict(text) {
  const lower = text.toLowerCase();
  if (lower.includes('lottery') || lower.includes('.apk')) {
    return { verdict: 'Malicious', explanation: 'Stub verdict: matched a lottery or APK scam pattern.' };
  }
  if (lower.includes('kyc')) {
    return { verdict: 'Suspicious', explanation: 'Stub verdict: matched a KYC pattern.' };
  }
  return { verdict: 'Safe', explanation: 'Stub verdict: no scam pattern matched.' };
}

// Step 25: never let a slow or failing agent hang the request.
const DEFAULT_TIMEOUT_MS = 15000;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Agent timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Step 26: privacy-safe log line. Logs the verdict and length only; the text itself needs LOG_TEXT=true.
function logResult(text, result, source) {
  let line = `[analyze] source=${source} verdict=${result.verdict} len=${text.length}`;
  if (result.error) line += ' error=true';
  if (process.env.LOG_TEXT === 'true') line += ` text=${JSON.stringify(text)}`;
  console.log(line);
}

router.post('/', validateBody, async (req, res) => {
  const { text } = req.body;

  // Step 24: the stub stays available behind USE_STUB=true.
  if (process.env.USE_STUB === 'true') {
    // Step 86: STUB_DELAY_MS adds an artificial delay so the extension's "Checking..." badge can be seen and tested.
    const delayMs = Number(process.env.STUB_DELAY_MS) || 0
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
    const result = stubVerdict(text);
    logResult(text, result, 'stub');
    return res.json(result);
  }

  try {
    const timeoutMs = Number(process.env.ANALYZE_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
    const result = await withTimeout(analyzeMessage(text), timeoutMs);
    logResult(text, result, 'agent');
    return res.json(result);
  } catch (err) {
    // Step 25: on any agent failure return HTTP 200 with a Suspicious fallback, never a crash.
    console.error(`[analyze] agent failed: ${err.message}`);
    const result = { ...FALLBACK_VERDICT, error: true };
    logResult(text, result, 'fallback');
    return res.json(result);
  }
});

export default router;
