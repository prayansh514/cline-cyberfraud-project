import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CACHE_MAX_ENTRIES, STORAGE_KEY, createVerdictCache, sha256Hex } from './cache.js'

function memoryStore() {
  const data = new Map()
  return { data, get: async (k) => data.get(k), set: async (k, v) => void data.set(k, structuredClone(v)) }
}

test('Step 95: sha256Hex matches the published SHA-256 test vectors', async () => {
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  assert.equal(await sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  assert.notEqual(await sha256Hex('hello'), await sha256Hex('hello '))
})

test('a stored verdict is returned; an unknown hash is a miss', async () => {
  const cache = createVerdictCache(memoryStore())
  assert.equal(await cache.get('nope'), null)
  assert.equal(await cache.set('h1', { verdict: 'Malicious', explanation: 'Fake KYC.' }), true)
  assert.deepEqual(await cache.get('h1'), { verdict: 'Malicious', explanation: 'Fake KYC.' })
  assert.equal(await cache.size(), 1)
})

test('the store never holds the message text, only a hash and the verdict', async () => {
  const store = memoryStore()
  const cache = createVerdictCache(store)
  const hash = await sha256Hex('Hi [NAME], your a/c [NUMBER] is blocked')
  await cache.set(hash, { verdict: 'Suspicious', explanation: 'x' })
  const raw = JSON.stringify(store.data.get(STORAGE_KEY))
  assert.ok(!raw.includes('NAME') && !raw.includes('blocked'))
  assert.ok(raw.includes(hash))
})

test('entries expire after the time to live', async () => {
  let clock = 1_000
  const cache = createVerdictCache(memoryStore(), { ttlMs: 500, now: () => clock })
  await cache.set('h', { verdict: 'Safe', explanation: '' })
  clock += 400
  assert.deepEqual(await cache.get('h'), { verdict: 'Safe', explanation: '' })
  clock += 200
  assert.equal(await cache.get('h'), null)
})

test('the oldest entries are evicted beyond the size limit', async () => {
  let clock = 0
  const cache = createVerdictCache(memoryStore(), { maxEntries: 3, now: () => (clock += 1) })
  for (const h of ['a', 'b', 'c', 'd', 'e']) await cache.set(h, { verdict: 'Safe', explanation: h })
  assert.equal(await cache.size(), 3)
  assert.equal(await cache.get('a'), null)
  assert.equal(await cache.get('b'), null)
  assert.deepEqual(await cache.get('e'), { verdict: 'Safe', explanation: 'e' })
  assert.ok(CACHE_MAX_ENTRIES >= 100)
})

test('invalid values are ignored and never stored', async () => {
  const cache = createVerdictCache(memoryStore())
  assert.equal(await cache.set('h', { verdict: '', explanation: 'x' }), false)
  assert.equal(await cache.set('h', {}), false)
  assert.equal(await cache.size(), 0)
})

test('concurrent writes do not lose entries', async () => {
  const cache = createVerdictCache(memoryStore())
  await Promise.all(Array.from({ length: 25 }, (_, i) => cache.set(`k${i}`, { verdict: 'Safe', explanation: String(i) })))
  assert.equal(await cache.size(), 25)
  assert.deepEqual(await cache.get('k17'), { verdict: 'Safe', explanation: '17' })
})
