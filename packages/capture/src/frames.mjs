// Frame times while a page scrolls: the gap between animation frames, the long ones, and the machine's load.
// Headless Chrome caps frames at 60 Hz, so the median says little: p5 fps and the share over 33 ms carry it.
import { cpus, loadavg } from 'node:os'
import { gpuOf } from './browser.mjs'
import { scrollAndSettle } from './settle.mjs'

const at = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0
const round = (n, digits = 2) => Number(n.toFixed(digits))

/** Summarises frame gaps in ms: p5 fps, median, p95, the longest, and the frames over 33 and 50 ms. */
export function frameStats(gaps) {
  const sorted = [...gaps].sort((a, b) => a - b)
  const over = (ms) => gaps.filter((g) => g > ms).length
  return {
    count: gaps.length,
    p5Fps: round(1000 / Math.max(at(sorted, 0.95), 0.001), 1),
    medianMs: round(at(sorted, 0.5)),
    p95Ms: round(at(sorted, 0.95)),
    maxMs: round(sorted.at(-1) ?? 0, 1),
    over33: over(33.4),
    over33Share: round(gaps.length ? over(33.4) / gaps.length : 0, 4),
    over50: over(50),
  }
}

/** In the page: records frame gaps and long tasks until `stop` is called through `weftFrames`. */
const RECORD = () => {
  const gaps = []
  const tasks = { count: 0, ms: 0 }
  const seen = new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      tasks.count++
      tasks.ms += e.duration
    }
  })
  seen.observe({ type: 'longtask' })
  let last = 0
  let on = true
  const step = (now) => {
    if (last) gaps.push(now - last)
    last = now
    if (on) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
  const y0 = scrollY
  const stop = () => {
    on = false
    seen.disconnect()
    return {
      gaps,
      longTasks: tasks.count,
      longTaskMs: Math.round(tasks.ms),
      scrolled: scrollY - y0,
    }
  }
  Object.assign(globalThis, { weftFrames: stop })
}

/** In the page: scrolls at `speed` CSS px/s for `seconds`, one step per frame. */
const GLIDE = ([seconds, speed]) =>
  new Promise((done) => {
    const y0 = scrollY
    const t0 = performance.now()
    const step = (now) => {
      scrollTo({ top: y0 + ((now - t0) / 1000) * speed, behavior: 'instant' })
      if (now - t0 < seconds * 1000) requestAnimationFrame(step)
      else done(undefined)
    }
    requestAnimationFrame(step)
  })

// `wheel` sends wheel steps from outside the page, so a smooth scroller in it runs; `scroll` moves it directly.
/** Frame times while the page scrolls at `speed` CSS px/s for `seconds`, with the CPU slowed `cpu` times. */
export async function frames(page, options = {}) {
  const { seconds = 5, speed = 600, cpu = 1, from = 0, driver = 'scroll' } = options
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu })
  await scrollAndSettle(page, from)
  const loadBefore = loadavg()[0] ?? 0
  await page.evaluate(RECORD)
  if (driver === 'wheel') {
    await page.mouse.move(10, 10)
    const end = Date.now() + seconds * 1000
    for (let last = Date.now(); Date.now() < end;) {
      await new Promise((done) => {
        setTimeout(done, 16)
      })
      const now = Date.now()
      await page.mouse.wheel(0, ((now - last) / 1000) * speed)
      last = now
    }
  } else await page.evaluate(GLIDE, [seconds, speed])
  const run = await page.evaluate(() => Reflect.get(globalThis, 'weftFrames')())
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  return {
    seconds,
    speed,
    cpu,
    driver,
    scrolled: Math.round(run.scrolled),
    frames: frameStats(run.gaps),
    longTasks: run.longTasks,
    longTaskMs: run.longTaskMs,
    load: { before: round(loadBefore), after: round(loadavg()[0] ?? 0) },
    machine: {
      cpu: cpus()[0]?.model ?? 'unknown',
      cores: cpus().length,
      platform: process.platform,
    },
    browser: page.context().browser()?.version() ?? null,
    gpu: await gpuOf(page),
  }
}
