import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRateLimiter } from './rateLimit.js'

function make(max, windowMs) {
  let clock = 1_000
  const limiter = createRateLimiter({ max, windowMs, now: () => clock })
  return { limiter, advance: (ms) => { clock += ms }, stop: () => limiter.stop() }
}

test('allows `max` requests per window, then refuses, with the time to wait', () => {
  const { limiter, stop } = make(3, 1000)
  assert.deepEqual([limiter.hit('a'), limiter.hit('a'), limiter.hit('a')].map((r) => r.allowed), [true, true, true])
  const blocked = limiter.hit('a')
  assert.equal(blocked.allowed, false)
  assert.equal(blocked.remaining, 0)
  assert.ok(blocked.retryAfterMs > 0 && blocked.retryAfterMs <= 1000)
  stop()
})

test('remaining counts down', () => {
  const { limiter, stop } = make(3, 1000)
  assert.equal(limiter.hit('a').remaining, 2)
  assert.equal(limiter.hit('a').remaining, 1)
  assert.equal(limiter.hit('a').remaining, 0)
  stop()
})

test('recovers after the window passes', () => {
  const { limiter, advance, stop } = make(2, 1000)
  limiter.hit('a'); limiter.hit('a')
  assert.equal(limiter.hit('a').allowed, false)
  advance(999)
  assert.equal(limiter.hit('a').allowed, false)
  advance(1)
  assert.equal(limiter.hit('a').allowed, true)
  stop()
})

test('clients are counted separately', () => {
  const { limiter, stop } = make(1, 1000)
  assert.equal(limiter.hit('a').allowed, true)
  assert.equal(limiter.hit('a').allowed, false)
  assert.equal(limiter.hit('b').allowed, true)
  stop()
})

test('refused requests do not extend the window', () => {
  const { limiter, advance, stop } = make(1, 1000)
  limiter.hit('a')
  for (let i = 0; i < 50; i += 1) { advance(10); assert.equal(limiter.hit('a').allowed, false) }
  advance(500)
  assert.equal(limiter.hit('a').allowed, true)
  stop()
})

test('expired windows are removed, so memory stays bounded', () => {
  const { limiter, advance, stop } = make(5, 1000)
  for (let i = 0; i < 100; i += 1) limiter.hit(`ip${i}`)
  assert.equal(limiter.size(), 100)
  advance(1001)
  limiter.sweep()
  assert.equal(limiter.size(), 0)
  stop()
})
