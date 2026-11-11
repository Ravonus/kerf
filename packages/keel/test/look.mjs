// A look at the running demo, for tuning: node test/look.mjs <url> <out dir> [progress...] [--look=pixel] [--eval=js]
// Opens Chrome on the GPU, scrubs to each position, saves a PNG and prints what the page reports.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const [url, out, ...rest] = process.argv.slice(2)
const flags = Object.fromEntries(
  rest.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split(/=(.*)/s).slice(0, 2)),
)
const stops = rest.filter((a) => !a.startsWith('--')).map(Number)
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({
  viewport: { width: Number(flags.width ?? 1280), height: Number(flags.height ?? 720) },
  deviceScaleFactor: Number(flags.dpr ?? 1),
})
page.on('pageerror', (e) => console.log('pageerror:', e.message))
page.on('console', (m) => {
  if (['error', 'warning'].includes(m.type())) console.log(`${m.type()}:`, m.text())
})
await page.goto(url)
await page.waitForFunction(() => globalThis.grove?.ready, null, { timeout: 60_000 })
if (flags.look) {
  await page.click(`button:text-is("${flags.look === 'pixel' ? 'Dithered' : 'Lit'}")`)
  await page.waitForFunction((look) => globalThis.grove.look === look, flags.look)
}
if (flags.eval) await page.evaluate(flags.eval)
for (const stop of stops.length ? stops : [0]) {
  await page.evaluate((p) => {
    const scene = document.querySelector('.scene')
    scrollTo(0, scene.offsetTop + (scene.offsetHeight - innerHeight) * p)
  }, stop)
  await page.waitForFunction((p) => Math.abs(globalThis.grove.progress - p) < 0.002, stop)
  await page.waitForTimeout(Number(flags.settle ?? 900))
  const name = `${flags.look ?? 'realism'}-${String(Math.round(stop * 100)).padStart(3, '0')}.png`
  await page.screenshot({ path: join(out, name) })
  const report = await page.evaluate(
    () =>
      new Promise((done) => {
        let frames = 0
        const from = performance.now()
        const tick = (now) => {
          frames++
          if (now - from < 1000) requestAnimationFrame(tick)
          else
            done({
              fps: Math.round((frames * 1000) / (now - from)),
              triangles: globalThis.grove.triangles,
            })
        }
        requestAnimationFrame(tick)
      }),
  )
  console.log(name, JSON.stringify(report))
}
if (flags.report) console.log(JSON.stringify(await page.evaluate(flags.report)))
await browser.close()
