// Step 96: client-side rate limiting for requests to the backend.
//
// createLimiter(max) returns run(task): at most `max` tasks are in flight at once; the rest wait in a FIFO queue and
// start as soon as a slot frees up. A task that throws or rejects still frees its slot, so one failure can never block
// the queue.
//
// Identical in-flight work is shared by createSingleFlight(): two requests for the same key made at the same moment
// run once and both get the same answer.

export const MAX_CONCURRENT_REQUESTS = 3

export function createLimiter(max = MAX_CONCURRENT_REQUESTS, { onChange } = {}) {
  let active = 0
  let peak = 0
  const waiting = []

  function report() {
    onChange?.({ active, queued: waiting.length })
  }

  function next() {
    while (active < max && waiting.length > 0) {
      const start = waiting.shift()
      active += 1
      peak = Math.max(peak, active)
      start()
    }
    report()
  }

  function run(task) {
    return new Promise((resolve, reject) => {
      // The slot is freed BEFORE the caller's promise settles, so anything that runs after `await limiter.run(...)`
      // already sees the up-to-date counts and a free slot.
      const finish = (settle, value) => {
        active -= 1
        settle(value)
        next()
      }
      waiting.push(() => {
        Promise.resolve()
          .then(task)
          .then((value) => finish(resolve, value), (error) => finish(reject, error))
      })
      next()
    })
  }

  return {
    run,
    stats: () => ({ active, queued: waiting.length, peak, max }),
  }
}

export function createSingleFlight() {
  const pending = new Map()
  return function once(key, task) {
    if (pending.has(key)) return pending.get(key)
    const promise = Promise.resolve()
      .then(task)
      .finally(() => pending.delete(key))
    pending.set(key, promise)
    return promise
  }
}
