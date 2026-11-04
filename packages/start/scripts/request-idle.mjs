// A load state's old networkidle event cannot settle mutations started after that event.
import { setTimeout as delay } from 'node:timers/promises'

/** Track server-function requests and wait for their current batch and follow-up requests. */
export function functionRequestsIdle(page, { quietMs = 500, timeoutMs = 10_000 } = {}) {
  const pending = new Set()
  let changedAt = Date.now()
  page.on('request', request => {
    if (!request.url().includes('/_weft/fn/')) return
    pending.add(request)
    changedAt = Date.now()
  })
  const finished = request => {
    if (pending.delete(request)) changedAt = Date.now()
  }
  page.on('requestfinished', finished)
  page.on('requestfailed', finished)
  return async () => {
    const deadline = Date.now() + timeoutMs
    while (pending.size || Date.now() - changedAt < quietMs) {
      if (Date.now() >= deadline) throw new Error('Server-function requests did not settle')
      await delay(10)
    }
  }
}
