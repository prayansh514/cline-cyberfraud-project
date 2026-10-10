import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVerdict, FALLBACK_VERDICT } from './parseVerdict.js';

test('parses clean JSON', () => {
  const out = parseVerdict('{"verdict":"Malicious","explanation":"Fake KYC link."}');
  assert.deepEqual(out, { verdict: 'Malicious', explanation: 'Fake KYC link.' });
});

test('parses markdown-fenced JSON', () => {
  const raw = '```json\n{"verdict":"Safe","explanation":"Casual chat."}\n```';
  assert.deepEqual(parseVerdict(raw), { verdict: 'Safe', explanation: 'Casual chat.' });
});

test('parses JSON surrounded by prose', () => {
  const raw = 'Here is my analysis: {"verdict":"Suspicious","explanation":"Urgent tone {be careful}."} Hope it helps!';
  assert.deepEqual(parseVerdict(raw), { verdict: 'Suspicious', explanation: 'Urgent tone {be careful}.' });
});

test('invalid verdict value falls back to Suspicious', () => {
  const out = parseVerdict('{"verdict":"Definitely fine","explanation":"x"}');
  assert.deepEqual(out, FALLBACK_VERDICT);
  assert.equal(out.verdict, 'Suspicious');
});

test('garbage text falls back to Suspicious', () => {
  assert.deepEqual(parseVerdict('I cannot help with that.'), FALLBACK_VERDICT);
  assert.deepEqual(parseVerdict('{not valid json'), FALLBACK_VERDICT);
  assert.deepEqual(parseVerdict(''), FALLBACK_VERDICT);
  assert.deepEqual(parseVerdict(undefined), FALLBACK_VERDICT);
});
