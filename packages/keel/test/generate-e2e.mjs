// The generate host in real Chrome: a portrait and its plate built in workers against the same built on the main
// thread (`?here`), by the first frame and the long tasks before it; then a reload reads them from Cache Storage.
//   node test/generate-e2e.mjs
import { chromium } from 'playwright-core'
import { upperMedian as median } from '../../../scripts/lib/helpers.mjs'
import { serveDemo } from './serve.mjs'

const served = await serveDemo()
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
})
let failed = 0
const ok = (name, pass, detail = '') => {
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`)
  if (!pass) failed++
}
const LONG = `globalThis.long = []
new PerformanceObserver((l) => { for (const e of l.getEntries()) globalThis.long.push(Math.round(e.duration)) })
  .observe({ type: 'longtask', buffered: true })`

/** Loads the page `runs` times, cold, and gives each run's first frame, wait and long tasks. */
async function load(query, runs = 3) {
  const out = []
  for (let i = 0; i < runs; i++) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()
    const problems = []
    page.on('pageerror', (e) => problems.push(e.message))
    await page.addInitScript(LONG)
    await page.goto(`${served.base}/sitter.html${query}`)
    await page.waitForFunction(() => globalThis.sitter?.ready > 0, null, { timeout: 60_000 })
    const run = await page.evaluate(() => ({ ...globalThis.sitter, long: globalThis.long }))
    out.push({ ...run, problems, page, ctx })
  }
  return out
}
const describe = (runs) => {
  const longest = runs.map((r) => Math.max(0, ...r.long))
  return {
    ready: median(runs.map((r) => r.ready)),
    waited: median(runs.map((r) => r.waited)),
    longest: median(longest),
    total: median(runs.map((r) => r.long.reduce((s, d) => s + d, 0))),
  }
}
const line = (d) =>
  `first frame ${d.ready} ms, data after ${d.waited} ms, longest task ${d.longest} ms, long tasks ${d.total} ms`

{
  console.log('a portrait and its plate, built in workers and on the main thread')
  const before = await load('?here')
  const after = await load('')
  const [b, a] = [describe(before), describe(after)]
  console.log(`       main thread: ${line(b)}`)
  console.log(`       workers:     ${line(a)}`)
  ok(
    'the workers keep the build off the main thread',
    a.longest < b.longest / 2,
    `${a.longest} < ${b.longest} / 2`,
  )
  ok(
    'no page errors',
    [...before, ...after].every((r) => !r.problems.length),
    after[0].problems.join(' | '),
  )

  const { page } = after[0]
  const kept = await page.evaluate(
    async () => (await (await caches.open('keel-generate')).keys()).length,
  )
  ok('the bust is kept in Cache Storage, the plate is not', kept === 1, `${kept} entries`)
  await page.reload()
  await page.waitForFunction(() => globalThis.sitter?.ready > 0, null, { timeout: 60_000 })
  const again = await page.evaluate(() => globalThis.sitter.waited)
  ok('a reload reads them back', again < a.waited, `data after ${again} ms`)
  for (const r of [...before, ...after]) await r.ctx.close()
}

await browser.close()
served.close()
console.log(failed ? `\n${failed} failed` : '\nall passed')
process.exit(failed ? 1 : 0)
