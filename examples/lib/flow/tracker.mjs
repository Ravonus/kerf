import { sleep } from '../stats.mjs'

/** Requests the page has open, and when it last finished one. Streams that never end aren't data. */
export function tracker(page) {
  const open = new Set(),
    t = { sent: 0, last: 0 }
  const counts = (r) =>
    !['script', 'stylesheet', 'image', 'font', 'media', 'websocket', 'eventsource'].includes(
      r.resourceType(),
    )
  page.on('request', (r) => {
    if (counts(r)) {
      open.add(r)
      t.sent++
    }
  })
  const done = (r) => {
    if (open.delete(r)) t.last = Date.now()
  }
  page.on('requestfinished', done)
  page.on('requestfailed', done)
  /** Until nothing has been open for `ms`, at most `max`. */
  t.quiet = async (ms = 400, max = 8000) => {
    const end = Date.now() + max
    let calm = Date.now()
    while (Date.now() < end) {
      if (open.size) calm = Date.now()
      else if (Date.now() - calm >= ms) return true
      await sleep(25)
    }
    return false
  }
  return t
}
