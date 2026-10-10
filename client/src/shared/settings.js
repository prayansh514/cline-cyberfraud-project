// Settings (chrome.storage.sync) and counters (chrome.storage.local), shared by the popup, the service worker and the
// content script. Every function tolerates a missing or invalidated chrome.* API and falls back to the defaults, so a
// reloaded extension never throws in the page.
import { DEFAULT_API_URL } from './config.js'

export const DEFAULT_SETTINGS = Object.freeze({ enabled: true, apiUrl: DEFAULT_API_URL })
export const DEFAULT_STATS = Object.freeze({ scanned: 0, flagged: 0, blocked: 0 })
export const STAT_KEYS = Object.keys(DEFAULT_STATS)

// Accepts "http(s)://host[:port][/path]"; returns the URL without a trailing slash.
//   -> { ok: true, url } or { ok: false, error }
export function normalizeApiUrl(value) {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (raw === '') return { ok: false, error: 'Enter the backend URL, for example http://localhost:5000' }
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    return { ok: false, error: 'That is not a valid URL' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { ok: false, error: 'The URL must start with http:// or https://' }
  return { ok: true, url: parsed.href.replace(/\/+$/, '') }
}

export async function getSettings() {
  try {
    const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS)
    return { enabled: stored.enabled !== false, apiUrl: normalizeApiUrl(stored.apiUrl).url ?? DEFAULT_SETTINGS.apiUrl }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

// Saves a partial update, e.g. { enabled: false } or { apiUrl: 'http://localhost:5000' }.
export async function saveSettings(patch) {
  await chrome.storage.sync.set(patch)
  return getSettings()
}

export async function getStats() {
  try {
    const stored = await chrome.storage.local.get(DEFAULT_STATS)
    return Object.fromEntries(STAT_KEYS.map((k) => [k, Number(stored[k]) || 0]))
  } catch {
    return { ...DEFAULT_STATS }
  }
}

export async function resetStats() {
  await chrome.storage.local.set({ ...DEFAULT_STATS })
}

// Calls back with the new settings whenever the user changes them. Returns an unsubscribe function.
export function onSettingsChanged(callback) {
  try {
    const listener = (changes, area) => {
      if (area === 'sync' && ('enabled' in changes || 'apiUrl' in changes)) getSettings().then(callback)
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  } catch {
    return () => {}
  }
}

// Calls back with the new counters whenever they change. Returns an unsubscribe function.
export function onStatsChanged(callback) {
  try {
    const listener = (changes, area) => {
      if (area === 'local' && STAT_KEYS.some((k) => k in changes)) getStats().then(callback)
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  } catch {
    return () => {}
  }
}
