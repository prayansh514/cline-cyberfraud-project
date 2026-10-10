// Steps 82, 84 and 86: the warning banner and the "Checking..." badge that are injected into a message bubble.
//
// Each one lives inside its own Shadow DOM host, so WhatsApp's CSS cannot restyle it and our Tailwind CSS cannot leak
// into WhatsApp. The compiled Tailwind CSS (src/styles/banner.css) is imported as a string and placed in the shadow root.
import bannerCss from '../styles/banner.css?inline'
import { BUBBLE } from './selectors.js'

export const BANNER_ATTR = 'data-scamguard-banner'

const THEMES = {
  Malicious: { box: 'bg-red-50 border-red-600 text-red-900', badge: 'bg-red-600 text-white', label: 'Malicious: do not trust this message' },
  Suspicious: { box: 'bg-amber-50 border-amber-500 text-amber-900', badge: 'bg-amber-500 text-white', label: 'Suspicious: be careful' },
  Pending: { box: 'bg-slate-50 border-slate-400 text-slate-700', badge: 'bg-slate-500 text-white', label: 'Checking...' },
  Unverified: { box: 'bg-slate-50 border-slate-400 text-slate-700', badge: 'bg-slate-500 text-white', label: 'Could not verify' },
}

function bubbleOf(row) {
  return row?.querySelector?.(BUBBLE) ?? row
}

function makeHost(kind) {
  const host = document.createElement('div')
  host.setAttribute(BANNER_ATTR, kind)
  host.style.setProperty('display', 'block')
  const root = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = bannerCss
  root.appendChild(style)
  return { host, root }
}

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

// Removes any banner or badge from a row (all kinds).
export function removeBanner(row) {
  for (const host of bubbleOf(row)?.querySelectorAll?.(`[${BANNER_ATTR}]`) ?? []) host.remove()
}

// Small badge: "Checking..." while a verdict is pending (Step 86), "Could not verify" on failure (Step 94).
export function showBadge(row, kind = 'Pending') {
  const bubble = bubbleOf(row)
  if (!bubble) return null
  removeBanner(row)
  const theme = THEMES[kind] ?? THEMES.Pending
  const { host, root } = makeHost(kind.toLowerCase())
  const badge = el('div', `mt-1 inline-block rounded px-2 py-0.5 text-xs font-semibold ${theme.badge}`, theme.label)
  badge.setAttribute('role', 'status')
  root.appendChild(badge)
  bubble.appendChild(host)
  return host
}

// Warning banner under the message (Step 82 for Malicious, Step 83 for Suspicious) with a Dismiss button (Step 84).
//   onDismiss(row) is called when the user presses Dismiss.
export function showBanner(row, { verdict, explanation }, { onDismiss } = {}) {
  const bubble = bubbleOf(row)
  const theme = THEMES[verdict]
  if (!bubble || !theme) return null
  removeBanner(row)
  const { host, root } = makeHost('verdict')
  const box = el('div', `mt-2 rounded border-l-4 p-2 text-sm leading-snug ${theme.box}`)
  box.setAttribute('role', 'alert')
  const title = el('div', 'font-bold', theme.label)
  title.setAttribute('data-part', 'title')
  const body = el('div', 'mt-1', explanation || 'No explanation was provided.')
  body.setAttribute('data-part', 'explanation')
  const button = el('button', `mt-2 rounded px-2 py-1 text-xs font-semibold ${theme.badge}`, 'Dismiss')
  button.setAttribute('type', 'button')
  button.setAttribute('data-part', 'dismiss')
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    onDismiss?.(row)
  })
  box.append(title, body, button)
  root.appendChild(box)
  bubble.appendChild(host)
  return host
}
