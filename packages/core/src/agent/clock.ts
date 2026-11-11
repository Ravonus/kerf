import { real, settle } from './real'

let log: (step: { kind: 'clock'; op: 'install' | 'advance'; ms?: number }) => void = () => {}
export function setClockLog(fn: typeof log) {
  log = fn
}

type Callback = (...args: unknown[]) => void
type Timer = { id: number; at: number; fn: Callback; args: unknown[]; every?: number | undefined }
const timers = new Map<number, Timer>()
let fakeNow = 0
let installedAt = 0
let nextTimer = 1
let installed = false

const g = globalThis as unknown as Record<string, unknown>

/**
 * The page's clock, faked like @kerf/core/test's `clock`: `pause()` stops time for timers, intervals, rAF, `Date` and
 * `performance.now`; `advance(ms)` runs what falls due, in order; `resume()` hands pending timers back to real time.
 * Timers scheduled before `pause()` stay on real time: pass `{ reload: true }` to pause from the next page load.
 */
export const clock = {
  status: () => ({ installed, now: installed ? fakeNow : real.Date.now(), pending: timers.size }),
  pause({ reload = false } = {}) {
    if (reload) {
      sessionStorage.setItem('kerf:clock', 'paused')
      real.setTimeout(() => location.reload(), 0)
      return { reloading: true }
    }
    install()
    log({ kind: 'clock', op: 'install' })
    return clock.status()
  },
  async advance(ms: number) {
    if (!installed) throw new Error('the clock is running on real time: `time pause` first')
    const end = fakeNow + ms
    for (;;) {
      const due = [...timers.values()]
        .filter((t) => t.at <= end)
        .sort((a, b) => a.at - b.at || a.id - b.id)[0]
      if (!due) break
      fakeNow = due.at
      if (due.every) due.at += due.every
      else timers.delete(due.id)
      try {
        due.fn(...due.args)
      } catch (e) {
        real.setTimeout(() => {
          throw e
        }, 0)
      }
      await settle()
    }
    fakeNow = end
    await settle()
    log({ kind: 'clock', op: 'advance', ms })
    return clock.status()
  },
  resume() {
    if (!installed) return clock.status()
    uninstall()
    sessionStorage.removeItem('kerf:clock')
    return clock.status()
  },
}

export function install() {
  if (installed) return
  installed = true
  fakeNow = real.Date.now()
  installedAt = real.now()
  const add = (fn: Callback, ms = 0, args: unknown[], every?: number) => {
    const id = nextTimer++
    timers.set(id, {
      id,
      at: fakeNow + Math.max(0, ms),
      fn,
      args,
      every: every === undefined ? undefined : Math.max(1, every),
    })
    return id
  }
  g.setTimeout = (fn: Callback, ms?: number, ...args: unknown[]) => add(fn, ms, args)
  g.setInterval = (fn: Callback, ms?: number, ...args: unknown[]) => add(fn, ms, args, ms ?? 0)
  g.clearTimeout = g.clearInterval = (id: number) => {
    timers.delete(id)
  }
  g.requestAnimationFrame = (fn: FrameRequestCallback) => add(() => fn(performance.now()), 16, [])
  g.cancelAnimationFrame = (id: number) => {
    timers.delete(id)
  }
  const RealDate = real.Date
  g.Date = class extends RealDate {
    constructor(...args: unknown[]) {
      super(...((args.length ? args : [fakeNow]) as []))
    }
    static override now() {
      return fakeNow
    }
  }
  const from = fakeNow
  performance.now = () => installedAt + (fakeNow - from)
}

function uninstall() {
  installed = false
  Object.assign(g, {
    setTimeout: real.setTimeout,
    setInterval: real.setInterval,
    clearTimeout: real.clearTimeout,
    clearInterval: real.clearInterval,
    Date: real.Date,
  })
  if (real.requestAnimationFrame)
    Object.assign(g, {
      requestAnimationFrame: real.requestAnimationFrame,
      cancelAnimationFrame: real.cancelAnimationFrame,
    })
  performance.now = real.now
  // Pending fake timers continue on real time with what was left of their delay. Their ids change.
  for (const t of timers.values()) {
    const left = Math.max(0, t.at - fakeNow)
    if (t.every)
      real.setTimeout(() => {
        t.fn(...t.args)
        real.setInterval(() => t.fn(...t.args), t.every)
      }, left)
    else real.setTimeout(() => t.fn(...t.args), left)
  }
  timers.clear()
}
