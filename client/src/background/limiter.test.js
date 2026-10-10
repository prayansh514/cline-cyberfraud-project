import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_CONCURRENT_REQUESTS, createLimiter, createSingleFlight } from './limiter.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

test('Step 96: the default limit is 3', () => {
  assert.equal(MAX_CONCURRENT_REQUESTS, 3)
  assert.equal(createLimiter().stats().max, 3)
})

test('never more than 3 run at once, the rest queue, and all 5 eventually finish', async () => {
  const limiter = createLimiter(3)
  let inFlight = 0
  let peak = 0
  const order = []
  const task = (id) => async () => {
    inFlight += 1
    peak = Math.max(peak, inFlight)
    order.push(`start ${id}`)
    await sleep(30)
    inFlight -= 1
    order.push(`end ${id}`)
    return id
  }
  const results = Promise.all([1, 2, 3, 4, 5].map((id) => limiter.run(task(id))))
  assert.equal(limiter.stats().active, 3)
  assert.equal(limiter.stats().queued, 2)
  assert.deepEqual(await results, [1, 2, 3, 4, 5])
  assert.equal(peak, 3)
  assert.equal(limiter.stats().peak, 3)
  assert.deepEqual(order.slice(0, 3), ['start 1', 'start 2', 'start 3']) // FIFO
  assert.equal(limiter.stats().active, 0)
  assert.equal(limiter.stats().queued, 0)
})

test('a failing task frees its slot and does not block the queue', async () => {
  const limiter = createLimiter(1)
  const failed = limiter.run(async () => { throw new Error('boom') })
  const ok = limiter.run(async () => 'fine')
  await assert.rejects(failed, /boom/)
  assert.equal(await ok, 'fine')
  assert.equal(limiter.stats().active, 0)
})

test('a synchronous throw is also handled', async () => {
  const limiter = createLimiter(2)
  await assert.rejects(limiter.run(() => { throw new Error('sync') }), /sync/)
  assert.equal(await limiter.run(() => 7), 7)
})

test('onChange reports active and queued counts', async () => {
  const seen = []
  const limiter = createLimiter(1, { onChange: (s) => seen.push(`${s.active}/${s.queued}`) })
  await Promise.all([limiter.run(() => sleep(10)), limiter.run(() => sleep(10))])
  assert.ok(seen.includes('1/1'))
  assert.equal(seen[seen.length - 1], '0/0')
})

test('single flight: the same key at the same time runs once, different keys run separately', async () => {
  const once = createSingleFlight()
  let calls = 0
  const work = async () => { calls += 1; const id = calls; await sleep(20); return id }
  const [a, b, c] = await Promise.all([once('x', work), once('x', work), once('y', work)])
  assert.equal(calls, 2)
  assert.equal(a, b)
  assert.notEqual(a, c)
  await once('x', work) // finished: a new request runs again
  assert.equal(calls, 3)
})
