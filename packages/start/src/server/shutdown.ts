type ShutdownState = {
  last?: () => unknown
  listening?: boolean
  drained?: () => void
}

// Nitro and the SSR entry are separate bundles but share one serving process.
const key = Symbol.for('kerf.start.shutdown')
const shared = globalThis as typeof globalThis & { [key]?: ShutdownState }
const state = (shared[key] ??= {})

/** Notify Start that Nitro's HTTP server has closed its connections. */
export function serverDrained() {
  state.drained?.()
}

/** Stop Start's services and exit after the HTTP server drains on SIGTERM or SIGINT. */
export function onShutdown(stop: () => unknown) {
  state.last = stop
  if (state.listening || typeof process === 'undefined' || !process.on) return
  state.listening = true
  let stopping = false
  for (const signal of ['SIGTERM', 'SIGINT'] as const)
    process.on(signal, () => {
      if (stopping) process.exit(0)
      stopping = true
      const seconds = Number.parseInt(process.env.SERVER_SHUTDOWN_TIMEOUT || '') || 5
      const http = new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, Math.max(0, seconds) * 1000)
        state.drained = () => {
          clearTimeout(timer)
          resolve()
        }
      })
      const services = Promise.resolve()
        .then(() => state.last?.())
        .catch(() => {})
      void Promise.all([http, services]).then(() => process.exit(0))
    })
}
