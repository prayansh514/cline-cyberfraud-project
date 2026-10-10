// Step 95: verdict cache for the service worker.
//
// Key   : SHA-256 of the ANONYMIZED text (crypto.subtle), so the cache never holds a message, only a hash.
// Value : { verdict, explanation, savedAt }. Failed requests and the server's generic fallback are never stored, so
//         a retry after an outage always asks the backend again.
//
// A Manifest V3 service worker is stopped after about 30 s idle and loses its memory, so entries are also kept in
// chrome.storage.session (cleared when the browser closes). The storage is injected, which lets the logic run in Node
// unit tests with a plain in-memory object.

export const CACHE_TTL_MS = 60 * 60 * 1000 // one hour
export const CACHE_MAX_ENTRIES = 200
export const STORAGE_KEY = 'scamguard:verdictCache'

export async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(String(text))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// store: { get(key) -> Promise<value|undefined>, set(key, value) -> Promise<void> }
export function createVerdictCache(store, { ttlMs = CACHE_TTL_MS, maxEntries = CACHE_MAX_ENTRIES, now = () => Date.now() } = {}) {
  // Reads and writes are queued so two quick calls can never overwrite each other's changes.
  let queue = Promise.resolve()
  const run = (task) => {
    const result = queue.then(task)
    queue = result.catch(() => {})
    return result
  }

  async function load() {
    const data = await store.get(STORAGE_KEY)
    return data && typeof data === 'object' ? data : {}
  }

  return {
    // Returns { verdict, explanation } or null.
    get: (hash) =>
      run(async () => {
        const entry = (await load())[hash]
        if (!entry) return null
        if (now() - entry.savedAt > ttlMs) return null
        return { verdict: entry.verdict, explanation: entry.explanation }
      }),

    // Stores a real verdict. Ignores anything else.
    set: (hash, { verdict, explanation }) =>
      run(async () => {
        if (typeof verdict !== 'string' || verdict === '') return false
        const data = await load()
        data[hash] = { verdict, explanation: typeof explanation === 'string' ? explanation : '', savedAt: now() }
        // Drop expired entries first, then the oldest ones beyond the size limit.
        for (const [key, entry] of Object.entries(data)) if (now() - entry.savedAt > ttlMs) delete data[key]
        const keys = Object.keys(data).sort((a, b) => data[a].savedAt - data[b].savedAt)
        for (const key of keys.slice(0, Math.max(0, keys.length - maxEntries))) delete data[key]
        await store.set(STORAGE_KEY, data)
        return true
      }),

    size: () => run(async () => Object.keys(await load()).length),
    clear: () => run(() => store.set(STORAGE_KEY, {})),
  }
}

// The real store: chrome.storage.session, falling back to memory if it is not available.
export function chromeSessionStore() {
  const memory = new Map()
  const area = typeof chrome !== 'undefined' ? chrome.storage?.session : undefined
  return {
    async get(key) {
      try {
        if (area) return (await area.get(key))[key]
      } catch {
        // fall through to memory
      }
      return memory.get(key)
    },
    async set(key, value) {
      try {
        if (area) return await area.set({ [key]: value })
      } catch {
        // fall through to memory
      }
      memory.set(key, value)
    },
  }
}
