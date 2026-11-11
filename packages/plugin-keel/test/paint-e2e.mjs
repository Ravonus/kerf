// The painted grounds demo in real Chrome: two cards and a paper tile painted at build (`?paint`) and encoded by
// plugin-media, and one card painted in the page (`paintLive`).   node test/paint-e2e.mjs
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import { serveDemo } from './serve.mjs'

const started = performance.now()
const served = await serveDemo()
console.log(`  demo built in ${Math.round(performance.now() - started)} ms`)
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

/** The bytes of each painted image's files in the build, rung by rung: `avif 320 2950, 640 9200, …`. */
function bytesOf(stem) {
  const dir = join(served.out, 'assets')
  const by = {}
  for (const f of readdirSync(dir)) {
    const rung = new RegExp(`^${stem}-(\\d+)-[0-9a-f]+\\.(\\w+)$`).exec(f)
    if (rung) (by[rung[2]] ??= []).push([Number(rung[1]), statSync(join(dir, f)).size])
  }
  return Object.entries(by).map(
    ([ext, rungs]) =>
      `${ext} ${rungs
        .sort((a, b) => a[0] - b[0])
        .map((r) => r.join(' '))
        .join(', ')}`,
  )
}

/** How far the tile's opposite edges sit apart, against neighbouring pixels inside it: near 1 when it wraps. */
const seamScript = `globalThis.seamOf = async (src) => {
  const img = new Image()
  img.src = src
  await img.decode()
  const w = img.naturalWidth, h = img.naturalHeight
  const x = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true })
  x.drawImage(img, 0, 0)
  const d = x.getImageData(0, 0, w, h).data
  const at = (i, j) => { const k = (j * w + i) * 4; return d[k] + d[k + 1] + d[k + 2] }
  let edge = 0, inner = 0
  for (let j = 0; j < h; j++) {
    edge += Math.abs(at(0, j) - at(w - 1, j))
    inner += Math.abs(at(w >> 1, j) - at((w >> 1) - 1, j))
  }
  for (let i = 0; i < w; i++) {
    edge += Math.abs(at(i, 0) - at(i, h - 1))
    inner += Math.abs(at(i, h >> 1) - at(i, (h >> 1) - 1))
  }
  return edge / inner
}`

{
  console.log('painted grounds')
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  })
  const page = await ctx.newPage()
  await page.addInitScript(seamScript)
  const problems = []
  page.on('pageerror', (e) => problems.push(e.message))
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type()) && !/GL Driver Message/.test(m.text()))
      problems.push(m.text())
  })
  await page.goto(`${served.base}/paint.html`)
  const cards = await page.evaluate(async () => {
    const out = {}
    for (const id of ['floral', 'cloth']) {
      const img = document.querySelector(`[data-card="${id}"] img`)
      img.loading = 'eager'
      await img.decode()
      out[id] = { src: img.currentSrc, shown: img.getBoundingClientRect().width }
    }
    return out
  })
  for (const [id, c] of Object.entries(cards))
    ok(
      `the ${id} card shows its AVIF, the 2x rung`,
      /-1108-[^/]+\.avif$/.test(c.src) && c.shown === 554,
      `${c.src.split('/').at(-1)}`,
    )
  const records = await page.evaluate(() => {
    const { floral, cloth, paper } = globalThis.paintDemo
    return [floral, cloth, paper].map((r) => ({
      name: r.name,
      width: r.width,
      height: r.height,
      sources: r.sources.map((s) => s.type),
      placeholder: Boolean(r.placeholder),
      dominant: r.dominant,
    }))
  })
  ok(
    'each is a media record with a ladder and a placeholder',
    records.every((r) => r.sources[0] === 'image/avif' && r.placeholder && r.dominant),
    records.map((r) => `${r.name} ${r.width}x${r.height} ${r.sources.join('+')}`).join(', '),
  )
  const band = await page.evaluate(
    () => getComputedStyle(document.querySelector('.band')).backgroundImage,
  )
  ok(
    'the paper tile is the band background',
    /paper-512-[0-9a-f]+\.avif/.test(band),
    band.slice(0, 90),
  )
  const paperSrc = await page.evaluate(() => globalThis.paintDemo.paper.src)
  const seam = await page.evaluate((src) => globalThis.seamOf(src), paperSrc)
  ok('and it meets itself at its edges', seam < 1.5, `edge/inner ${seam.toFixed(2)}`)

  const live = await page.evaluate(async () => {
    while (!globalThis.paintDemo.live)
      await new Promise((r) => {
        setTimeout(r, 20)
      })
    const img = document.querySelector('[data-card="live"] img')
    await img.decode()
    const a = globalThis.paintDemo.live
    return {
      ms: globalThis.paintDemo.liveMs,
      src: a.src,
      type: a.type,
      width: img.naturalWidth,
      digest: a.digest,
    }
  })
  ok(
    'a themed card is painted in the page',
    live.src.startsWith('blob:') && live.width === 1108 && /^[0-9a-f]+$/.test(live.digest),
    `${live.type}, painted and encoded in ${live.ms} ms`,
  )
  ok('no errors or warnings', problems.length === 0, problems.join(' | '))
  await ctx.close()

  for (const stem of ['floral', 'cloth', 'paper']) {
    console.log(`       ${stem} (B): ${bytesOf(stem).join('; ')}`)
  }
}

await browser.close()
served.close()
console.log(failed ? `\n${failed} failed` : '\nall passed')
process.exit(failed ? 1 : 0)
