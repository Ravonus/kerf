let last: (() => unknown) | undefined
let listening = false

/**
 * On SIGTERM or SIGINT (a deploy or scale-down), stop the schedule and close realtime connections with "going away",
 * so open pages reconnect to an instance that's staying, while the server finishes the requests it has (Nitro's
 * server stops taking new ones and waits for them). The newest handler's is the one that runs.
 */
export function onShutdown(stop: () => unknown) {
  last = stop
  if (listening || typeof process === 'undefined' || !process.once) return
  listening = true
  for (const signal of ['SIGTERM', 'SIGINT'] as const)
    process.once(signal, () => {
      // A listener stops Node's own exit: with no other (Nitro's server has one), exit as the signal would have.
      const alone = process.listenerCount(signal) === 0
      void Promise.resolve(last?.())
        .catch(() => {})
        .finally(() => {
          if (alone) process.kill(process.pid, signal)
        })
    })
}
