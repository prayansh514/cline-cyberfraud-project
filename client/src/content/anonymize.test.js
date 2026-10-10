import { test } from 'node:test'
import assert from 'node:assert/strict'
import { anonymize, parseSenderName } from './anonymize.js'

// TC-08 exactly as it appears on the mock page, sent by "Customer Care".
const TC08 = 'Hi Rahul Sharma, your a/c 123456789012 is blocked, call 9876543210 or mail rahul@example.com'
const SENDER = parseSenderName('[10:49, 10/10/2026] Customer Care: ')

test('Step 67: nothing sensitive -> unchanged; empty and bad input are safe', () => {
  assert.equal(anonymize('hello'), 'hello')
  assert.equal(anonymize('Hi, are we meeting at 5 pm?'), 'Hi, are we meeting at 5 pm?')
  assert.equal(anonymize('Rs 25,00,000 won, room 1204 at 5 pm'), 'Rs 25,00,000 won, room 1204 at 5 pm')
  assert.equal(anonymize(''), '')
  for (const bad of [undefined, null, 42, {}]) assert.equal(anonymize(bad), '')
})

test('TC-08 becomes: Hi [NAME], your a/c [NUMBER] is blocked, call [PHONE] or mail [EMAIL]', () => {
  const out = anonymize(TC08, { senderName: SENDER })
  assert.equal(out, 'Hi [NAME], your a/c [NUMBER] is blocked, call [PHONE] or mail [EMAIL]')
})

test('TC-08 output contains none of the personal values', () => {
  for (const options of [{ senderName: SENDER }, {}]) {
    const out = anonymize(TC08, options)
    for (const secret of ['9876543210', '123456789012', 'rahul@example.com', 'Rahul', 'Sharma']) {
      assert.ok(!out.includes(secret), `"${secret}" leaked in: ${out}`)
    }
  }
})

test('Step 68: phone, email, UPI and long numbers', () => {
  assert.equal(anonymize('call +91 98765 43210 or 98765-43210'), 'call [PHONE] or [PHONE]')
  assert.equal(anonymize('email a.b+c@mail.example.co.in please'), 'email [EMAIL] please')
  assert.equal(anonymize('pay to rahul@okaxis now'), 'pay to [UPI] now')
  assert.equal(anonymize('pay to 9876543210@ybl'), 'pay to [UPI]')
  assert.equal(anonymize('card 4111 1111 1111 1111 expired'), 'card [NUMBER] expired')
  assert.equal(anonymize('account 123456789'), 'account [NUMBER]')
  assert.equal(anonymize('order 12345678 shipped'), 'order 12345678 shipped') // 8 digits: not an account number
  assert.equal(anonymize('call me on +91 98XXXXXX10'), 'call me on +91 98XXXXXX10') // already masked by the sender
})

test('Step 69: sender name from data-pre-plain-text is replaced everywhere, in any case and spacing', () => {
  assert.equal(parseSenderName('[10:42, 10/10/2026] Rahul Sharma: '), 'Rahul Sharma')
  assert.equal(parseSenderName('bad'), '')
  assert.equal(parseSenderName(null), '')
  const out = anonymize('Rahul Sharma says verify now. Regards, rahul  sharma', { senderName: 'Rahul Sharma' })
  assert.equal(out, '[NAME] says verify now. Regards, [NAME]')
  assert.equal(anonymize('Prahul is not Rahul-san', { senderName: 'Rahul' }), 'Prahul is not [NAME]-san')
  assert.equal(anonymize('call me', { senderName: '+91 98765 43210' }), 'call me')
  assert.equal(anonymize('hi', { senderName: 'Al' }), 'hi')
})

test('Step 69: greeting pattern masks names but not generic words', () => {
  assert.equal(anonymize('Hello Mr. Anil Kumar, your OTP is 1234'), 'Hello [NAME], your OTP is 1234')
  assert.equal(anonymize('hello Priya, kindly verify'), 'hello [NAME], kindly verify')
  assert.equal(anonymize('Dear customer, update KYC'), 'Dear customer, update KYC')
  assert.equal(anonymize('Dear Customer, update KYC'), 'Dear Customer, update KYC')
  assert.equal(anonymize('Hi everyone'), 'Hi everyone')
})

test('Step 70: URLs keep domain and path; personal query values become [REDACTED]', () => {
  assert.equal(anonymize('http://sbi-kyc-update.xyz/login?id=9876543210'), 'http://sbi-kyc-update.xyz/login?id=[REDACTED]')
  assert.equal(
    anonymize('http://x.xyz/a?token=abc123&lang=en&phone=9876543210#top'),
    'http://x.xyz/a?token=[REDACTED]&lang=en&phone=[REDACTED]#top',
  )
  assert.equal(anonymize('Visit www.example.com/pay?uid=555&ref=abc.'), 'Visit www.example.com/pay?uid=[REDACTED]&ref=abc.')
  assert.equal(anonymize('see https://bit.ly/3xFr33G1ft, now.'), 'see https://bit.ly/3xFr33G1ft, now.')
  assert.equal(anonymize('Update KYC now: http://sbi-kyc-update.xyz/login'), 'Update KYC now: http://sbi-kyc-update.xyz/login')
  assert.equal(anonymize('http://a.b/c?ID=123456789012&Email=x@y.com'), 'http://a.b/c?ID=[REDACTED]&Email=[REDACTED]')
  // Text around a link is still anonymized.
  assert.equal(anonymize('call 9876543210 then open http://x.xyz/p?otp=123456'), 'call [PHONE] then open http://x.xyz/p?otp=[REDACTED]')
})

test('APK file names and ordinary links pass through unchanged', () => {
  assert.equal(anonymize('SBI_Rewards_Update.apk'), 'SBI_Rewards_Update.apk')
  assert.equal(anonymize('Invoice_March.pdf'), 'Invoice_March.pdf')
})
