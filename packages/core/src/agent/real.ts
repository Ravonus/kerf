import { flush as flushGraph } from '../index'

// Real timers, saved before the fake clock can replace them: the bridge itself always runs on real time.
export const real = {
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
  setInterval: globalThis.setInterval.bind(globalThis),
  clearInterval: globalThis.clearInterval.bind(globalThis),
  requestAnimationFrame: globalThis.requestAnimationFrame?.bind(globalThis),
  cancelAnimationFrame: globalThis.cancelAnimationFrame?.bind(globalThis),
  Date: globalThis.Date,
  now: performance.now.bind(performance),
  fetch: globalThis.fetch?.bind(globalThis),
  WebSocket: globalThis.WebSocket,
  EventSource: globalThis.EventSource,
}
export const sleep = (ms: number) =>
  new Promise<void>((r) => {
    real.setTimeout(r, ms)
  })

/** Let the app settle: Kerf's queue, microtasks, then one real task. */
export async function settle() {
  for (let i = 0; i < 3; i++) {
    await Promise.resolve()
    flushGraph()
  }
  await sleep(0)
  flushGraph()
}
