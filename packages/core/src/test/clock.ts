import { vi } from 'vitest'
import { flush } from './flush'

const faked = [
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'setImmediate',
  'clearImmediate',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'Date',
  'performance',
] as const

/**
 * A deterministic clock for timers, `resource` fetches that wait on them, and rAF. `install()` before anything
 * schedules; every `advance` ends in `flush()`. Uninstalled after each test. Use it instead of sleeping (T004).
 */
export const clock = {
  installed: false,
  install(now: number | Date = 0) {
    vi.useFakeTimers({ toFake: [...faked], now })
    clock.installed = true
  },
  async advance(ms: number) {
    if (!clock.installed)
      throw new Error(
        'T004: clock.advance() needs clock.install() first, before the code under test schedules its timers',
      )
    await vi.advanceTimersByTimeAsync(ms)
    await flush()
  },
  /** Run every pending timer (and the ones they schedule), then flush. */
  async runAll() {
    if (!clock.installed) throw new Error('T004: clock.runAll() needs clock.install() first')
    await vi.runAllTimersAsync()
    await flush()
  },
  now: () => Date.now(),
  uninstall() {
    if (!clock.installed) return
    vi.useRealTimers()
    clock.installed = false
  },
}
