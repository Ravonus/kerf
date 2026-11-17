// Plain JavaScript: Nitro loads the server plugin that imports this from node_modules, where Node strips no types.
// Nitro and the SSR entry are separate bundles but share one serving process.
const key = Symbol.for('kerf.start.shutdown')
const state = (globalThis[key] ??= {})

export function serverDrained() {
  state.drained?.()
}

export function onShutdown(stop) {
  // The server plugin arms the signals with no handler of its own: it must not replace the app's.
  if (stop) state.last = stop
  if (state.listening || typeof process === 'undefined' || !process.on) return
  state.listening = true
  let stopping = false
  for (const signal of ['SIGTERM', 'SIGINT'])
    process.on(signal, () => {
      if (stopping) process.exit(0)
      stopping = true
      const seconds = Number.parseInt(process.env.SERVER_SHUTDOWN_TIMEOUT || '') || 5
      const http = new Promise((resolve) => {
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
