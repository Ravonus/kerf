// The grove demo in real Chrome on the GPU: pixels, not recordings.   node test/e2e.mjs   (build ../core's compiler first)
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bake, capture, open as openAt, sheet } from '@weft-js/capture'
import { chromium } from 'playwright-core'
import { serveDemo } from './serve.mjs'

const served = await serveDemo()
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: [
    '--use-angle=metal',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--autoplay-policy=no-user-gesture-required',
  ],
})

let failed = 0
const ok = (name, pass, detail = '') => {
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`)
  if (!pass) failed++
}

/** Paints now and reads the canvas in the same task, so a cleared drawing buffer can't fool it. */
const inkScript = `globalThis.inkOf = () => {
  const canvas = document.querySelector('[data-surface] canvas')
  clock.seek(clock.seconds)
  const w = 96, h = 54
  const x = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true })
  x.drawImage(canvas, 0, 0, w, h)
  const d = x.getImageData(0, 0, w, h).data
  let hash = 2166136261
  const seen = new Set()
  for (let i = 0; i < d.length; i += 4) {
    hash = Math.imul(hash ^ ((d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | d[i + 2] >> 3), 16777619)
    seen.add((d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | d[i + 2] >> 4)
  }
  return { hash: hash >>> 0, colours: seen.size }
}`

const open = async (options = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, ...options })
  const page = await ctx.newPage()
  await page.addInitScript(inkScript)
  page.problems = []
  page.on('pageerror', (e) => page.problems.push(e.message))
  page.on('console', (m) => {
    if (
      ['error', 'warning'].includes(m.type()) &&
      !/GL Driver Message|status of 404/.test(m.text())
    )
      page.problems.push(m.text())
  })
  await page.goto(served.base)
  await page.waitForFunction(() => globalThis.grove?.ready, null, { timeout: 60_000 })
  return page
}
const scrub = async (page, to) => {
  await page.evaluate((p) => {
    const scene = document.querySelector('.scene')
    scrollTo(0, scene.offsetTop + (scene.offsetHeight - innerHeight) * p)
  }, to)
  await page.waitForFunction((p) => Math.abs(globalThis.grove.progress - p) < 0.002, to)
  await page.waitForTimeout(300)
}

{
  console.log('the scene')
  const page = await open()
  const start = await page.evaluate(() => globalThis.inkOf())
  ok('a lit grove paints', start.colours > 40, `${start.colours} colours`)
  ok(
    'only the look in use was loaded',
    await page.evaluate(
      () =>
        performance.getEntriesByType('resource').some((r) => /lit-finish/.test(r.name)) &&
        !performance.getEntriesByType('resource').some((r) => /voxel-dither|band/.test(r.name)),
    ),
  )
  await scrub(page, 1)
  const end = await page.evaluate(() => globalThis.inkOf())
  ok('scrolling scrubs the scene', end.hash !== start.hash)
  ok(
    'the timeline reached its last keys',
    await page.evaluate(() => Math.abs(globalThis.grove.stage.camera.fov - 50) < 0.01),
  )

  await scrub(page, 0.5)
  const lit = await page.evaluate(() => globalThis.inkOf())
  await page.click('button:text-is("Dithered")')
  await page.waitForFunction(() => globalThis.grove.look === 'pixel')
  const dithered = await page.evaluate(() => globalThis.inkOf())
  ok('the same scene wears the dithered look', dithered.hash !== lit.hash)
  ok(
    'the dithered look holds fewer colours',
    dithered.colours < lit.colours,
    `${dithered.colours} < ${lit.colours}`,
  )
  await page.click('button:text-is("Lit")')
  await page.waitForFunction(() => globalThis.grove.look === 'realism')

  await page.click('button:text-is("Sound")')
  await page.waitForFunction(
    () => globalThis.grove.band?.playing && globalThis.grove.band.step > 8,
    null,
    { timeout: 15_000 },
  )
  ok('the band plays from a click', true)
  await page.click('button:text-is("Sound")')
  await page.waitForFunction(() => !globalThis.grove.band.playing, null, { timeout: 5_000 })
  ok('and stops', true)
  ok('no errors or warnings', page.problems.length === 0, page.problems.join(' | '))
  await page.context().close()
}

{
  console.log('reduced motion')
  const page = await open({ reducedMotion: 'reduce' })
  const still = await page.evaluate(() => ({
    playing: globalThis.clock.playing.value,
    ink: globalThis.inkOf(),
  }))
  ok('the clock is paused and the scene still paints', !still.playing && still.ink.colours > 40)
  await scrub(page, 1)
  const moved = await page.evaluate(() => globalThis.inkOf())
  ok('scrolling still scrubs it', moved.hash !== still.ink.hash)
  ok('no errors or warnings', page.problems.length === 0, page.problems.join(' | '))
  await page.context().close()
}

/** Where a paper panel's top edge stands down the canvas, column by column: the first row up from the bottom that is
 * not paper. Also the share of the frame that is paper. */
const edgeScript = `globalThis.edgeOf = () => {
  const canvas = document.querySelector('[data-surface] canvas')
  clock.seek(clock.seconds)
  const w = canvas.width, h = canvas.height
  const x = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true })
  x.drawImage(canvas, 0, 0)
  const d = x.getImageData(0, 0, w, h).data
  const paper = (i) => d[i] > 205 && d[i + 1] > 200 && d[i + 2] > 190
  const rows = []
  let covered = 0
  for (let c = 0; c < 48; c++) {
    const col = Math.round(w * (0.1 + 0.8 * c / 47))
    let y = h - 1
    while (y >= 0 && paper((y * w + col) * 4)) y--
    rows.push(y)
    covered += (h - 1 - y) / h / 48
  }
  rows.sort((a, b) => a - b)
  return { spread: rows[43] - rows[4], middle: rows[24] / h, covered }
}`

// The scene stage: three sections over one pinned canvas.
const openStage = async (options = {}, query = '') => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, ...options })
  const page = await ctx.newPage()
  await page.addInitScript(inkScript)
  await page.addInitScript(edgeScript)
  page.problems = []
  page.on('pageerror', (e) => page.problems.push(e.message))
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type()) && !/GL Driver Message/.test(m.text()))
      page.problems.push(m.text())
  })
  await page.goto(`${served.base}/stage.html${query}`)
  await page.waitForFunction(
    () => document.querySelector('[data-surface]')?.style.opacity === '1',
    null,
    { timeout: 60_000 },
  )
  return page
}
/** Scrolls until scene `k` stands at position `p`, in viewports since its section began to enter. */
const stand = async (page, k, p) => {
  await page.evaluate(
    ([index, at]) => {
      const el = document.querySelectorAll('section')[index]
      const h = el.offsetHeight
      const vh = innerHeight
      const lead = 0.2 * vh
      const top = vh + lead - ((at * vh) / (h + vh)) * (h + vh + lead)
      scrollTo(0, el.getBoundingClientRect().top + scrollY - top)
    },
    [k, p],
  )
}
const settle = (page, k, p) =>
  page.waitForFunction(
    ([index, at]) => {
      const a = globalThis.stageDemo.active
      const near = (value) => Math.abs(value - at) < 0.01
      if (a?.to === index && a.from !== index) return near(a.t)
      return a?.active === index && a.from === a.to && near(a.position)
    },
    [k, p],
  )

{
  console.log('the scene stage')
  const page = await openStage()
  const first = await page.evaluate(() => globalThis.inkOf())
  ok('one canvas draws the first scene', first.colours > 20, `${first.colours} colours`)
  ok('there is one canvas on the page', (await page.locator('canvas').count()) === 1)
  await page.waitForFunction(() => globalThis.stageDemo.built.has('rings'))
  ok('the next scene is built while the first shows', true)
  await stand(page, 1, 0.3)
  await settle(page, 1, 0.3)
  const before = await page.evaluate(() => ({
    ...globalThis.stageDemo.active,
    ink: globalThis.inkOf(),
    handover: globalThis.stageDemo.handover,
  }))
  ok(
    'before the switch the first scene is active and drawn',
    before.active === 0,
    JSON.stringify(before),
  )
  ok(
    'the next scene blends in as line work out from a point',
    before.handover?.mode === 'radial' &&
      before.handover.lines &&
      Math.abs(before.handover.t - 0.3) < 0.02,
    JSON.stringify(before.handover),
  )
  ok('a blended frame is neither scene alone', before.ink.hash !== first.hash)
  await stand(page, 1, 0.7)
  await settle(page, 1, 0.7)
  const after = await page.evaluate(() => ({
    ...globalThis.stageDemo.active,
    marked: document.querySelector('[data-active]')?.getAttribute('aria-label'),
    ink: globalThis.inkOf(),
  }))
  ok('past 0.5 the incoming scene is active', after.active === 1 && after.marked === 'Rings')
  ok('and the canvas moves on to it', after.ink.hash !== before.ink.hash)
  await stand(page, 1, 1.2)
  await settle(page, 1, 1.2)
  const straight = await page.evaluate(() => globalThis.edgeOf())
  ok(
    'a straight-edged panel rises over the second scene, its edge one line',
    straight.spread <= 3 && Math.abs(straight.middle - 0.5) < 0.08,
    JSON.stringify(straight),
  )
  await stand(page, 1, 1.5)
  await settle(page, 1, 1.5)
  const over = await page.evaluate(() => globalThis.edgeOf())
  ok('half-way through its sweep it covers the frame', over.covered > 0.97, JSON.stringify(over))
  await stand(page, 2, 1.2)
  await settle(page, 2, 1.2)
  const torn = await page.evaluate(() => globalThis.edgeOf())
  ok(
    "the third scene's tracks bring a torn panel, its edge jagged",
    torn.spread > 4 && Math.abs(torn.middle - 0.5) < 0.08,
    JSON.stringify(torn),
  )
  await stand(page, 2, 1.5)
  await page.waitForFunction(() => {
    const { built, active } = globalThis.stageDemo
    return active.active === 2 && built.has('blocks') && !built.has('orrery')
  })
  ok('a scene two away is freed and the last one is built', true)
  await page.evaluate(() => scrollTo(0, 0))
  await page.waitForFunction(() => (globalThis.stageDemo.built.get('orrery') ?? 0) > 2)
  ok('scrolling back builds and draws the first scene again', true)
  ok('no errors or warnings', page.problems.length === 0, page.problems.join(' | '))
  await page.context().close()
}

{
  console.log('the scene stage under reduced motion')
  const page = await openStage({ reducedMotion: 'reduce' })
  const still = await page.evaluate(() => ({
    playing: globalThis.clock.playing.value,
    ink: globalThis.inkOf(),
  }))
  ok(
    'the clock is paused and the first scene still draws',
    !still.playing && still.ink.colours > 20,
  )
  await stand(page, 0, 1.6)
  // Four frames: the scroll event, the position, the paint, and one to spare. Eased, it would still be moving.
  const raw = await page.evaluate(async () => {
    for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame)
    return globalThis.stageDemo.active
  })
  ok(
    'the position follows the scroll at once',
    Math.abs(raw.position - 1.6) < 0.01,
    `${raw.position}`,
  )
  await stand(page, 1, 0.8)
  await page.waitForFunction(() => globalThis.stageDemo.handover !== null)
  const fade = await page.evaluate(() => globalThis.stageDemo.handover)
  ok(
    'a new active scene dissolves in, plainly',
    fade.mode === 'fade' && !fade.lines,
    JSON.stringify(fade),
  )
  ok('no errors or warnings', page.problems.length === 0, page.problems.join(' | '))
  await page.context().close()
}

{
  console.log('the blended frame, timed')
  const page = await openStage({}, '?measure')
  /** Repaints `n` times at once and gives the median and p95 of the frames of `kind`, in ms. */
  const time = (kind, n = 120) =>
    page.evaluate(
      ([k, count]) => {
        const kept = globalThis.stageDemo.timings[k]
        kept.length = 0
        for (let i = 0; i < count; i++) globalThis.clock.seek(globalThis.clock.seconds)
        const sorted = [...kept].sort((a, b) => a - b)
        const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
        return { frames: sorted.length, median: at(0.5), p95: at(0.95) }
      },
      [kind, n],
    )
  await stand(page, 0, 1.6)
  await settle(page, 0, 1.6)
  const alone = await time('alone')
  await stand(page, 1, 0.3)
  await settle(page, 1, 0.3)
  const blended = await time('blended')
  const ms = (r) => `median ${r.median.toFixed(2)} ms, p95 ${r.p95.toFixed(2)} ms over ${r.frames}`
  console.log(`  one scene: ${ms(alone)}`)
  console.log(`  a blended hand-over: ${ms(blended)}`)
  ok('every repaint of a hand-over was blended', blended.frames === 120, `${blended.frames}`)
  ok('no errors or warnings', page.problems.length === 0, page.problems.join(' | '))
  await page.context().close()
}

{
  console.log('baked posters, and stills at three stops')
  const dir = mkdtempSync(join(tmpdir(), 'weft-posters-'))
  const baked = await bake({ url: `${served.base}/stage.html`, out: dir, browser })
  const ids = Object.keys(baked.posters)
  const all = ids.flatMap((id) =>
    Object.entries(baked.posters[id]).map(([t, s]) => ({ id, t, ...s })),
  )
  for (const s of all)
    console.log(`       ${s.id} ${s.t}: ${s.width}x${s.height} ${s.bytes} B, ${s.ms} ms`)
  console.log(`       ${baked.format} q${baked.quality}, ${baked.ms} ms in all`)
  ok(
    'each scene bakes a wide and a tall poster',
    ids.join() === 'orrery,rings,blocks' && all.length === 6,
  )
  ok(
    'at the tiers sizes',
    all.every((s) => (s.t === 'desktop' ? s.width === 1440 && s.height === 900 : s.width === 780)),
  )
  ok('each still is its own', new Set(all.map((s) => s.bytes)).size === 6)
  const again = await serveDemo(0, dir)
  const url = `${again.base}/stage.html`
  const stops = [
    { section: 0, at: 0 },
    { section: 1, at: 0.5 },
    { section: 2, at: 1 },
  ]
  const shots = await capture({ url, browser, stops, width: 1280, height: 720 })
  const hashes = shots.stills.map((s) => s.hash)
  ok(
    'three stops draw three frames',
    new Set(hashes).size === 3,
    shots.stills.map((s) => s.y).join(),
  )
  const twice = await capture({ url, browser, stops: [stops[1]], width: 1280, height: 720 })
  ok('the same stop draws the same frame', twice.stills[0].hash === hashes[1])
  ok('no page errors', shots.problems.length === 0, shots.problems.join(' | '))
  const tiles = shots.stills.map((s) => s.png)
  const png = await sheet(browser, tiles, { labels: ['0@0', '1@0.5', '2@1'], width: 320, cols: 3 })
  ok('a sheet of the three', png.readUInt32BE(16) === 3 * 320 + 4 * 4, `${png.length} B`)

  const desk = await openAt(browser, { url, width: 1280, height: 720 })
  const srcs = await desk.$$eval('[data-scene-poster] img', (imgs) => imgs.map((i) => i.src))
  ok(
    'the page carries the baked posters',
    srcs.length === 3 && srcs.every((s) => s.endsWith('.avif')),
  )
  await desk.context().close()
  const phone = await openAt(browser, { url, width: 390, height: 844, dpr: 2, mobile: true })
  await phone.waitForFunction(() => document.querySelector('[data-stage-ready="poster"]'))
  const shown = await phone.evaluate(async () => {
    const img = document.querySelector('[data-scene-poster] img')
    await img.decode()
    const loaded = performance.getEntriesByType('resource').map((r) => r.name)
    return {
      canvases: document.querySelectorAll('canvas').length,
      lit: loaded.filter((n) => /surface\.renderer|runtime-|tracks-|device-profile/.test(n)),
      src: img.currentSrc,
    }
  })
  ok('a phone shows the tall poster', /mobile/.test(shown.src), shown.src)
  ok('and loads no renderer', shown.canvases === 0 && shown.lit.length === 0, shown.lit.join())
  await phone.context().close()
  again.close()
  rmSync(dir, { recursive: true, force: true })
}

await browser.close()
served.close()
console.log(failed ? `\n${failed} failed` : '\nall passed')
process.exit(failed ? 1 : 0)
