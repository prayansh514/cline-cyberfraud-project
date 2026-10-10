import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { shouldAnalyze } from './prefilter.js'

// Same texts as mock/fixtures/messages.json. The fixtures hold TC-08 already anonymized, but the pre-filter runs
// on the RAW message (before anonymizing), so TC-06 and TC-08 use the raw text shown on the mock page.
const fixtures = JSON.parse(readFileSync(new URL('../../../mock/fixtures/messages.json', import.meta.url), 'utf8'))
const byId = Object.fromEntries(fixtures.map((f) => [f.id, f.text]))
const RAW = {
  ...byId,
  'TC-06': '+91 98765 43210',
  'TC-08': 'Hi Rahul Sharma, your a/c 123456789012 is blocked, call 9876543210 or mail rahul@example.com',
}

test('Step 61: shape is { flagged, reasons } and bad input never throws', () => {
  assert.deepEqual(shouldAnalyze('hello'), { flagged: false, reasons: [] })
  for (const bad of [undefined, null, 42, {}, '', '   ']) {
    assert.deepEqual(shouldAnalyze(bad), { flagged: false, reasons: [] })
  }
})

test('TC-01 (plain chat) is not flagged', () => {
  assert.equal(shouldAnalyze(RAW['TC-01']).flagged, false)
})

test('TC-02 through TC-08 are flagged', () => {
  for (const id of ['TC-02', 'TC-03', 'TC-04', 'TC-05', 'TC-06', 'TC-07', 'TC-08']) {
    const r = shouldAnalyze(RAW[id])
    assert.equal(r.flagged, true, `${id}: ${RAW[id]}`)
    assert.ok(r.reasons.length > 0, id)
  }
})

test('each case is flagged for the expected reason', () => {
  assert.ok(shouldAnalyze(RAW['TC-02']).reasons.includes('url'))
  assert.ok(shouldAnalyze(RAW['TC-03']).reasons.includes('keyword'))
  assert.ok(shouldAnalyze(RAW['TC-04']).reasons.includes('keyword'))
  assert.ok(shouldAnalyze(RAW['TC-05']).reasons.includes('keyword'))
  assert.deepEqual(shouldAnalyze(RAW['TC-06']).reasons, ['phone-number'])
  assert.ok(shouldAnalyze(RAW['TC-07']).reasons.includes('url'))
  assert.ok(shouldAnalyze(RAW['TC-08']).reasons.includes('phone-number'))
})

test('Step 62: URL rule', () => {
  for (const t of ['Visit www.example.com', 'http://bit.ly/abc', 'tinyurl.com/x']) assert.equal(shouldAnalyze(t).flagged, true, t)
  for (const t of ['see you at 5.30', 'v1.2 released', 'e.g. this works']) assert.equal(shouldAnalyze(t).flagged, false, t)
})

test('Step 63: keywords use word boundaries', () => {
  for (const t of ['Share your OTP now', 'KYC pending', 'send via UPI', 'my PAN card', 'Your account  blocked']) {
    assert.ok(shouldAnalyze(t).reasons.includes('keyword'), t)
  }
  for (const t of ['company profile', 'pancake', 'company']) assert.equal(shouldAnalyze(t).flagged, false, t)
})

test('Step 63a / TC-10: .apk attachment name is flagged with the apk-file reason', () => {
  const r = shouldAnalyze(RAW['TC-10'])
  assert.equal(r.flagged, true)
  assert.ok(r.reasons.includes('apk-file'))
  assert.ok(shouldAnalyze(RAW['APK-02']).reasons.includes('apk-file'))
})

test('Step 63a: .APK in upper case is flagged, .apkg and .apk1 are not', () => {
  assert.ok(shouldAnalyze('update.APK').reasons.includes('apk-file'))
  assert.ok(shouldAnalyze('Install app.apk now').reasons.includes('apk-file'))
  assert.ok(shouldAnalyze('install this APK file').reasons.includes('apk-file'))
  for (const t of ['archive.apkg', 'data.apk1', 'apkpure', 'tapkeys are fun']) assert.equal(shouldAnalyze(t).flagged, false, t)
})

test('TC-11: a non-APK attachment name is not flagged', () => {
  assert.equal(shouldAnalyze(RAW['TC-11']).flagged, false)
  assert.equal(shouldAnalyze('see you at 5').flagged, false)
})

test('Step 64: Indian phone numbers', () => {
  for (const t of ['Call +91 9876543210', 'call 98765-43210', '9876543210', '+919876543210', '09876543210']) {
    assert.ok(shouldAnalyze(t).reasons.includes('phone-number'), t)
  }
  for (const t of ['5 pm at room 1204', 'order 123456 shipped', 'Rs 25,00,000', 'year 2026', '1234567890']) {
    assert.equal(shouldAnalyze(t).flagged, false, t)
  }
})
