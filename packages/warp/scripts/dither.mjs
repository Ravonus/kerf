// The dither family in a real browser: builds test/dither, serves it, screenshots each section in both themes, proves the
// tiers and themes differ in painted pixels, and measures frame rate and idle CPU.
//   node scripts/dither.mjs                 writes shots to evals/results/dither/ and numbers to evals/results/dither.json
//   node scripts/dither.mjs --shots=/tmp/x  shots somewhere else
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(pkg, 'package.json'))
const repo = resolve(pkg, '../..')
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d
const shots = resolve(arg('shots', join(repo, 'evals/results/dither')))
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }

async function build(outDir) {
  const vite = await import('vite')
  const { default: weft } = await import('@weft-js/core/vite')
  await vite.build({
    root: join(pkg, 'test/dither'),
    base: './',
    logLevel: 'silent',
    plugins: [weft()],
    build: { outDir, emptyOutDir: true },
  })
}
const serve = (dist) =>
  new Promise((ok) => {
    const s = createServer((q, r) => {
      const path = q.url.split('?')[0]
      const p = join(dist, path === '/' ? 'index.html' : path)
      if (!existsSync(p) || statSync(p).isDirectory()) {
        r.writeHead(404)
        return r.end()
      }
      r.writeHead(200, { 'content-type': types[extname(p)] ?? 'application/octet-stream' })
      r.end(readFileSync(p))
    }).listen(0, '127.0.0.1', () => ok(s))
  })

// Page-side: animation frames over a window, and the longest gap between them.
const FPS = (ms) =>
  new Promise((ok) => {
    const times = []
    const tick = (t) => {
      times.push(t)
      t - times[0] < ms
        ? requestAnimationFrame(tick)
        : ok({
            fps: Math.round(((times.length - 1) / ((t - times[0]) / 1000)) * 10) / 10,
            worst: Math.round(Math.max(...times.slice(1).map((v, i) => v - times[i])) * 10) / 10,
          })
    }
    requestAnimationFrame(tick)
  })
// Cost of the page's own frame work, by wrapping rAF callbacks.
const COST = () => {
  const real = requestAnimationFrame
  window.__work = 0
  window.__calls = 0
  window.requestAnimationFrame = (fn) =>
    real((t) => {
      const a = performance.now()
      fn(t)
      window.__work += performance.now() - a
      window.__calls++
    })
}

async function cpu(cdp) {
  const { metrics } = await cdp.send('Performance.getMetrics')
  return Object.fromEntries(metrics.map((m) => [m.name, m.value]))
}
async function idle(page, cdp, ms) {
  const a = await cpu(cdp)
  await page.waitForTimeout(ms)
  const b = await cpu(cdp)
  return {
    task: +(((b.TaskDuration - a.TaskDuration) * 1000) / (ms / 1000)).toFixed(2),
    script: +(((b.ScriptDuration - a.ScriptDuration) * 1000) / (ms / 1000)).toFixed(2),
  }
}

// Reads a canvas's backing pixels.
const PIXELS = (sel) => {
  const c = document.querySelector(sel)
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
  return { w: c.width, h: c.height, d: [...d] }
}
const moved = (a, b) => {
  let n = 0,
    inked = 0
  for (let i = 0; i < a.d.length; i += 4) {
    const on = a.d[i + 3] > 0 || b.d[i + 3] > 0
    if (on) inked++
    if (
      Math.abs(a.d[i] - b.d[i]) +
        Math.abs(a.d[i + 1] - b.d[i + 1]) +
        Math.abs(a.d[i + 2] - b.d[i + 2]) +
        Math.abs(a.d[i + 3] - b.d[i + 3]) >
      48
    )
      n++
  }
  return inked ? n / inked : 0
}

const { chromium } = require('playwright-core')
const dist = mkdtempSync(join(tmpdir(), 'warp-dither-'))
await build(dist)
const server = await serve(dist)
const url = `http://127.0.0.1:${server.address().port}/`
const browser = await chromium.launch()
mkdirSync(shots, { recursive: true })
const open = async (query = '', scheme = 'dark', extra = {}) => {
  const ctx = await browser.newContext({
    colorScheme: scheme,
    viewport: { width: 1280, height: 860 },
    deviceScaleFactor: 1,
    ...extra,
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.addInitScript(COST)
  await page.goto(url + query)
  await page.waitForSelector('[data-state="live"]')
  await page.waitForTimeout(500)
  return { page, ctx, errors }
}
const out = { errors: [] }

// looks
for (const scheme of ['dark', 'light']) {
  const { page, ctx, errors } = await open('', scheme)
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) {
      scrollTo(0, y)
      await new Promise((r) => {
        setTimeout(r, 120)
      })
    }
    scrollTo(0, 0)
  })
  await page.evaluate(`document.documentElement.dataset.expression='vivid'`)
  await page.evaluate(() => document.querySelector('[data-demo="stack"]').scrollIntoView())
  await page.waitForTimeout(2200)
  await page.evaluate('scrollTo(0, 0)')
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(shots, `all-vivid-${scheme}.png`), fullPage: true })
  await page.evaluate(`document.documentElement.dataset.expression='balanced'`)
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(shots, `all-balanced-${scheme}.png`), fullPage: true })
  out.errors.push(...errors)
  await ctx.close()
}

if (process.argv.includes('--looks')) {
  await browser.close()
  server.close()
  process.exit(0)
}

// pointer
{
  const { page, ctx, errors } = await open('?only=hero')
  await page.evaluate(`document.documentElement.dataset.expression='vivid'`)
  await page.waitForTimeout(300)
  const before = await page.evaluate(PIXELS, '[data-scope="dither"] canvas')
  for (let i = 0; i < 24; i++) {
    await page.mouse.move(300 + i * 18, 240 + Math.sin(i / 3) * 60)
    await page.waitForTimeout(16)
  }
  await page.screenshot({ path: join(shots, 'pointer-pull.png') })
  await page.mouse.click(760, 300)
  await page.waitForTimeout(280)
  await page.screenshot({ path: join(shots, 'pointer-shockwave.png') })
  out.pointer = {
    after: moved(before, await page.evaluate(PIXELS, '[data-scope="dither"] canvas')),
  }
  out.errors.push(...errors)
  await ctx.close()
}

// tiers and themes differ, on the same seed and in held frames
{
  const held = { reducedMotion: 'reduce' }
  const read = async (scheme) => {
    const { page, ctx } = await open('', scheme, held)
    const r = {}
    for (const n of ['quiet', 'balanced', 'vivid'])
      r[n] = await page.evaluate(PIXELS, `[data-probe="${n}"] canvas`)
    await ctx.close()
    return r
  }
  const dark = await read('dark'),
    light = await read('light')
  out.pixels = {}
  for (const [a, b] of [
    ['quiet', 'balanced'],
    ['quiet', 'vivid'],
    ['balanced', 'vivid'],
  ])
    out.pixels[`${a}/${b}`] = +moved(dark[a], dark[b]).toFixed(3)
  for (const n of ['quiet', 'balanced', 'vivid'])
    out.pixels[`dark/light ${n}`] = +moved(dark[n], light[n]).toFixed(3)
}

// frame rate, with one hero
{
  const { page, ctx } = await open('?only=hero')
  await page.evaluate(`document.documentElement.dataset.expression='vivid'`)
  await page.waitForTimeout(400)
  await page.evaluate(`window.__work=0;window.__calls=0`)
  const r = await page.evaluate(FPS, 4000)
  const w = await page.evaluate(`({ work: __work })`)
  out.hero = {
    ...r,
    msPerFrame: +(w.work / (r.fps * 4)).toFixed(2),
    cells: await page.evaluate(
      `(c => c.width * c.height)(document.querySelector('[data-scope="dither"] canvas'))`,
    ),
  }
  await ctx.close()
}

// fine cells: the case WebGL would be for
{
  const { page, ctx } = await open('?only=fields')
  await page.evaluate(`document.documentElement.dataset.expression='vivid'`)
  await page.waitForTimeout(300)
  await page.evaluate(`window.__work=0;window.__calls=0`)
  const r = await page.evaluate(FPS, 3000)
  const w = await page.evaluate(`({ work: __work })`)
  out.six = { ...r, msPerFrame: +(w.work / (r.fps * 3)).toFixed(2) }
  await ctx.close()
}

// idle: quiet holds still; a vivid field off screen and in a hidden tab does no work; a bare page is the baseline
{
  const cdpFor = async (page, ctx) => {
    const c = await ctx.newCDPSession(page)
    await c.send('Performance.enable')
    return c
  }
  const q = await open('?only=hero')
  await q.page.evaluate(`document.documentElement.dataset.expression='quiet'`)
  await q.page.waitForTimeout(500)
  await q.page.evaluate(`window.__calls=0`)
  out.idleQuiet = await idle(q.page, await cdpFor(q.page, q.ctx), 3000)
  out.idleQuiet.frames = await q.page.evaluate(`__calls`)
  await q.ctx.close()
  const off = await open('?only=hero')
  await off.page.evaluate(
    `document.documentElement.dataset.expression='vivid'; document.body.style.paddingTop='3000px'; scrollTo(0, 0)`,
  )
  await off.page.waitForTimeout(500)
  await off.page.evaluate(`window.__calls=0`)
  out.idleOffscreen = await idle(off.page, await cdpFor(off.page, off.ctx), 3000)
  out.idleOffscreen.frames = await off.page.evaluate(`__calls`)
  await off.ctx.close()
  const mid = await open('?only=hero', 'dark', { reducedMotion: 'reduce' })
  await mid.page.evaluate(`document.documentElement.dataset.expression='vivid'`)
  await mid.page.waitForTimeout(500)
  await mid.page.evaluate(`window.__calls=0`)
  out.idleReduced = await idle(mid.page, await cdpFor(mid.page, mid.ctx), 3000)
  out.idleReduced.frames = await mid.page.evaluate(`__calls`)
  await mid.ctx.close()
  const on = await open('?only=hero')
  await on.page.evaluate(`document.documentElement.dataset.expression='vivid'`)
  await on.page.waitForTimeout(500)
  out.running = await idle(on.page, await cdpFor(on.page, on.ctx), 3000)
  await on.ctx.close()
}

await browser.close()
server.close()
rmSync(dist, { recursive: true, force: true })
writeFileSync(join(repo, 'evals/results/dither.json'), JSON.stringify(out, null, 1) + '\n')
console.log(JSON.stringify(out, null, 1))
if (out.errors.length) process.exitCode = 1
