// @weft-js/scroll against the browser's own scrolling, in Chromium. Each run builds the package from source, opens
// one page per mode (native overflow, scroll with DOM bars, scroll with canvas bars) and measures:
//   mount     ms to make 200 areas of 50 rows and lay them out
//   wheel     a 2 s stream of trackpad-sized wheel events at 60 Hz over a 2,000-row area: main-thread ms per frame
//             (CDP task time), frames over 20 ms, input-to-scroll-event latency, and px covered
//   smooth    a smooth scroll of 4,000 px: how long it takes, and its frames
//   bytes     brotli size of the entry and of the canvas renderer
//   node bench/native.mjs [--runs 5] [--json]
import { brotliCompressSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const { rolldown } = require('rolldown')
const at = (p) => fileURLToPath(new URL(p, import.meta.url))
const args = process.argv.slice(2)
const runs = Number(args[args.indexOf('--runs') + 1]) || 5

async function bundle(input, minify) {
  const build = await rolldown({ input: at(input) })
  return (await build.generate({ format: 'iife', name: 'scroll_', minify })).output[0].code
}
const code = await bundle('../src/index.ts', false)
const canvasCode = await bundle('../test/fixtures/browser-entry.ts', false)
const bytes = {
  entry: brotliCompressSync(await bundle('../src/index.ts', true)).length,
  canvas: brotliCompressSync(await bundle('../src/canvas.ts', true)).length,
}
const css = readFileSync(at('../styles/scroll.css'), 'utf8')

const rows = (n) =>
  Array.from({ length: n }, (_, i) => `<p style="margin:0;height:40px">Row ${i}</p>`).join('')
const area = (id, n) =>
  `<div id="${id}" style="width:400px;height:400px"><div data-part="viewport"><div data-part="content">${rows(n)}</div></div></div>`

/** Start the mode on every `[data-area]`: native leaves the browser's own scrolling on. */
const start = (mode) => {
  const roots = [...document.querySelectorAll('[data-area]')]
  for (const r of roots) {
    if (mode === 'native') {
      r.querySelector('[data-part="viewport"]').style.cssText = 'height:100%;overflow:auto'
      r.style.overflow = 'hidden'
    } else
      window.scroll_.scroller(r, mode === 'canvas' ? { renderer: window.scroll_.canvas() } : {})
  }
}

async function page(browser, mode, body) {
  const p = await browser.newPage({ viewport: { width: 800, height: 600 } })
  await p.setContent(`<!doctype html><style>body{margin:0}${css}</style>${body}`)
  await p.addScriptTag({ content: mode === 'canvas' ? canvasCode : code })
  return p
}

async function mount(browser, mode) {
  const body = Array.from({ length: 200 }, (_, i) =>
    area(`a${i}`, 50).replace('<div id', '<div data-area id'),
  ).join('')
  const p = await page(browser, mode, body)
  await p.addScriptTag({ content: `window.__start = ${start.toString()}` })
  const ms = await p.evaluate((m) => {
    const t = performance.now()
    window.__start(m)
    document.body.getBoundingClientRect()
    return performance.now() - t
  }, mode)
  await p.close()
  return ms
}

async function wheel(browser, mode) {
  const p = await page(browser, mode, area('big', 2000).replace('<div id', '<div data-area id'))
  await p.addScriptTag({ content: `window.__start = ${start.toString()}` })
  await p.evaluate((m) => window.__start(m), mode)
  await p.evaluate(() => {
    const vp = document.querySelector('#big [data-part="viewport"]')
    window.__frames = []
    window.__pending = []
    window.__lat = []
    // Input to position: from a wheel event to the scroll event that reports its move, which both kinds of
    // scrolling fire in the frame the new position is drawn.
    vp.addEventListener('wheel', (e) => window.__pending.push(e.timeStamp), { passive: true })
    vp.addEventListener('scroll', () => {
      if (window.__pending.length) window.__lat.push(performance.now() - window.__pending[0])
      window.__pending.length = 0
    })
    const loop = (t) => {
      window.__frames.push(t)
      if (!window.__stop) requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  })
  const cdp = await p.context().newCDPSession(p)
  await cdp.send('Performance.enable')
  const metric = async () =>
    Object.fromEntries(
      (await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]),
    )
  await p.mouse.move(200, 200)
  const before = await metric()
  for (let i = 0; i < 120; i++) {
    await p.mouse.wheel(0, 12)
    await p.waitForTimeout(16)
  }
  await p.waitForTimeout(100)
  const after = await metric()
  const out = await p.evaluate(() => {
    window.__stop = true
    const f = window.__frames
    const gaps = f.slice(1).map((t, i) => t - f[i])
    const lat = window.__lat.sort((a, b) => a - b)
    const scrolled = document.querySelector('#big [data-part="viewport"]').scrollTop
    return {
      frames: f.length,
      long: gaps.filter((g) => g > 20).length,
      latency: lat[lat.length >> 1] ?? 0,
      scrolled,
    }
  })
  await p.close()
  return {
    ...out,
    taskMsPerFrame: ((after.TaskDuration - before.TaskDuration) * 1000) / out.frames,
  }
}

async function smooth(browser, mode) {
  const p = await page(browser, mode, area('big', 2000).replace('<div id', '<div data-area id'))
  await p.addScriptTag({ content: `window.__start = ${start.toString()}` })
  const out = await p.evaluate(async (m) => {
    const root = document.getElementById('big')
    const vp = root.querySelector('[data-part="viewport"]')
    if (m === 'native') window.__start(m)
    const opts = m === 'canvas' ? { renderer: window.scroll_.canvas() } : {}
    const s = m === 'native' ? vp : window.scroll_.scroller(root, opts)
    const t = performance.now()
    let frames = 0
    s.scrollTo({ top: 4000, behavior: 'smooth' })
    while (Math.abs(vp.scrollTop - 4000) > 1 && performance.now() - t < 3000) {
      await new Promise((r) => requestAnimationFrame(r))
      frames++
    }
    return { ms: performance.now() - t, frames }
  }, mode)
  await p.close()
  return out
}

const median = (xs) => [...xs].sort((a, b) => a - b)[xs.length >> 1]
const browser = await chromium.launch()
const modes = ['native', 'dom', 'canvas']
const results = {}
for (const mode of modes) {
  const r = { mount: [], wheel: [], smooth: [] }
  for (let i = 0; i < runs; i++) {
    r.mount.push(await mount(browser, mode))
    r.wheel.push(await wheel(browser, mode))
    r.smooth.push(await smooth(browser, mode))
  }
  results[mode] = {
    mountMs: median(r.mount),
    taskMsPerFrame: median(r.wheel.map((w) => w.taskMsPerFrame)),
    longFrames: median(r.wheel.map((w) => w.long)),
    latencyMs: median(r.wheel.map((w) => w.latency)),
    scrolled: median(r.wheel.map((w) => w.scrolled)),
    smoothMs: median(r.smooth.map((s) => s.ms)),
  }
}
await browser.close()

if (args.includes('--json')) console.log(JSON.stringify({ runs, bytes, results }, null, 2))
else {
  const fmt = (v) => (typeof v === 'number' ? v.toFixed(v < 10 ? 2 : 0) : String(v))
  console.log(
    `median of ${runs} runs, Chromium headless; bytes brotli: entry ${bytes.entry}, canvas ${bytes.canvas}`,
  )
  console.log(['mode', ...Object.keys(results.native)].join('\t'))
  for (const m of modes) console.log([m, ...Object.values(results[m]).map(fmt)].join('\t'))
}
