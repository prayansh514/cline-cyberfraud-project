import { useEffect, useState } from 'react'
import { HEALTH_TIMEOUT_MS, MESSAGES } from '../shared/config.js'
import { DEFAULT_SETTINGS, DEFAULT_STATS, getSettings, getStats, normalizeApiUrl, onStatsChanged, resetStats, saveSettings } from '../shared/settings.js'

function Stat({ id, label, value, tone }) {
  return (
    <div className="flex-1 rounded bg-slate-100 px-2 py-2 text-center">
      <div className={`text-xl font-bold ${tone}`} data-testid={`stat-${id}`}>{value}</div>
      <div className="text-xs text-slate-600">{label}</div>
    </div>
  )
}

// Asks the service worker whether the backend answers /api/health. Resolves to { ok, error }. Never rejects.
function checkBackend() {
  return new Promise((resolve) => {
    const guard = setTimeout(() => resolve({ ok: false, error: 'timed out' }), HEALTH_TIMEOUT_MS + 1000)
    try {
      chrome.runtime.sendMessage({ type: MESSAGES.HEALTH }, (reply) => {
        clearTimeout(guard)
        resolve(chrome.runtime.lastError || !reply ? { ok: false, error: 'no reply' } : reply)
      })
    } catch {
      clearTimeout(guard)
      resolve({ ok: false, error: 'unavailable' })
    }
  })
}

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label="Turn ScamGuard on or off"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-emerald-600' : 'bg-slate-400'}`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  )
}

export default function Popup() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [urlDraft, setUrlDraft] = useState(DEFAULT_SETTINGS.apiUrl)
  const [urlError, setUrlError] = useState('')
  const [stats, setStats] = useState({ ...DEFAULT_STATS })
  const [backend, setBackend] = useState({ state: 'checking' })
  const [ready, setReady] = useState(false)

  const refreshBackend = () => {
    setBackend({ state: 'checking' })
    checkBackend().then((r) => setBackend(r.ok ? { state: 'up' } : { state: 'down', error: r.error }))
  }

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s)
      setUrlDraft(s.apiUrl)
      setReady(true)
      refreshBackend()
    })
    getStats().then(setStats)
    return onStatsChanged(setStats)
  }, [])

  const changeEnabled = async (enabled) => setSettings(await saveSettings({ enabled }))

  const saveUrl = async () => {
    const result = normalizeApiUrl(urlDraft)
    if (!result.ok) return setUrlError(result.error)
    setUrlError('')
    const next = await saveSettings({ apiUrl: result.url })
    setSettings(next)
    setUrlDraft(next.apiUrl)
    refreshBackend()
  }

  const dot = { up: 'bg-emerald-500', down: 'bg-red-500', checking: 'bg-amber-400' }[backend.state]
  const backendText = { up: 'Backend connected', down: `Backend not reachable${backend.error ? ` (${backend.error})` : ''}`, checking: 'Checking backend...' }[backend.state]

  return (
    <div className="w-80 bg-white p-4 text-slate-800">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-red-600">ScamGuard</h1>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium" data-testid="enabled-label">{settings.enabled ? 'On' : 'Off'}</span>
          <Toggle checked={settings.enabled} onChange={changeEnabled} />
        </div>
      </header>

      <section className="mt-4">
        <label htmlFor="api-url" className="block text-xs font-semibold text-slate-600">Backend URL</label>
        <div className="mt-1 flex gap-2">
          <input
            id="api-url"
            type="text"
            value={urlDraft}
            disabled={!ready}
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveUrl()}
            className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm focus:border-red-500 focus:outline-none"
          />
          <button type="button" onClick={saveUrl} className="rounded bg-red-600 px-3 py-1 text-sm font-semibold text-white hover:bg-red-700">Save</button>
        </div>
        {urlError && <p role="alert" className="mt-1 text-xs text-red-600">{urlError}</p>}
      </section>

      <section className="mt-4 flex items-center gap-2 rounded bg-slate-100 px-2 py-1.5 text-sm" role="status">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${dot}`} data-testid="backend-dot" data-state={backend.state} />
        <span data-testid="backend-text">{backendText}</span>
      </section>

      <section className="mt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-slate-600">This browser</h2>
          <button type="button" onClick={() => resetStats().then(() => setStats({ ...DEFAULT_STATS }))} className="text-xs text-slate-500 underline hover:text-slate-700">Reset</button>
        </div>
        <div className="mt-1 flex gap-2">
          <Stat id="scanned" label="Scanned" value={stats.scanned} tone="text-slate-800" />
          <Stat id="flagged" label="Flagged" value={stats.flagged} tone="text-amber-600" />
          <Stat id="blocked" label="Blocked" value={stats.blocked} tone="text-red-600" />
        </div>
      </section>

      <p className="mt-3 text-xs text-slate-500" data-testid="status-line">
        {settings.enabled ? 'Watching WhatsApp Web for scams.' : 'Paused: messages are not being checked.'}
      </p>
    </div>
  )
}
