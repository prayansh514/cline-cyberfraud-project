// Step 97: a small per-IP rate limiter (fixed window), written by hand so the server needs no extra dependency.
//
// Each client IP may make `max` requests per `windowMs`. Extra requests get HTTP 429 with a JSON body and a
// Retry-After header, and the client can try again once the window has passed. Memory stays bounded: expired
// windows are deleted on every check, and by a background sweep that does not keep the process alive.

export const DEFAULT_MAX = 60 // requests ...
export const DEFAULT_WINDOW_MS = 60_000 // ... per minute, per IP

export function createRateLimiter({ max = DEFAULT_MAX, windowMs = DEFAULT_WINDOW_MS, now = () => Date.now() } = {}) {
  const windows = new Map() // ip -> { count, resetAt }

  function sweep() {
    const t = now()
    for (const [ip, w] of windows) if (t >= w.resetAt) windows.delete(ip)
  }

  // Returns { allowed, remaining, retryAfterMs } and counts the request when it is allowed.
  function hit(ip) {
    const t = now()
    let w = windows.get(ip)
    if (!w || t >= w.resetAt) {
      w = { count: 0, resetAt: t + windowMs }
      windows.set(ip, w)
    }
    if (w.count >= max) return { allowed: false, remaining: 0, retryAfterMs: w.resetAt - t }
    w.count += 1
    return { allowed: true, remaining: max - w.count, retryAfterMs: 0 }
  }

  const timer = setInterval(sweep, Math.max(1000, windowMs))
  timer.unref?.()

  return { hit, sweep, size: () => windows.size, stop: () => clearInterval(timer), max, windowMs }
}

// Express middleware. Limits come from RATE_LIMIT_MAX and RATE_LIMIT_WINDOW_MS (read when this is called).
export function rateLimit(options = {}) {
  const max = Number(options.max ?? process.env.RATE_LIMIT_MAX) || DEFAULT_MAX
  const windowMs = Number(options.windowMs ?? process.env.RATE_LIMIT_WINDOW_MS) || DEFAULT_WINDOW_MS
  const limiter = createRateLimiter({ max, windowMs })

  const middleware = (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown'
    const result = limiter.hit(ip)
    res.setHeader('X-RateLimit-Limit', String(max))
    res.setHeader('X-RateLimit-Remaining', String(result.remaining))
    if (result.allowed) return next()
    const retryAfterSeconds = Math.max(1, Math.ceil(result.retryAfterMs / 1000))
    res.setHeader('Retry-After', String(retryAfterSeconds))
    return res.status(429).json({ error: 'Too many requests. Please slow down.', retryAfterSeconds })
  }
  middleware.limiter = limiter
  return middleware
}
