// The grove demo in real Chrome on the GPU: pixels, not recordings.   node test/e2e.mjs   (build ../core's compiler first)
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

// The scene stage: three sections over one pinned canvas.
const openStage = async (options = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, ...options })
  const page = await ctx.newPage()
  await page.addInitScript(inkScript)
  page.problems = []
  page.on('pageerror', (e) => page.problems.push(e.message))
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type()) && !/GL Driver Message/.test(m.text()))
      page.problems.push(m.text())
  })
  await page.goto(`${served.base}/stage.html`)
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
      return a && (a.active === index || a.to === index) && near(a.to === index ? a.t : a.position)
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
  }))
  ok(
    'before the switch the first scene is active and drawn',
    before.active === 0,
    JSON.stringify(before),
  )
  await stand(page, 1, 0.7)
  await settle(page, 1, 0.7)
  const after = await page.evaluate(() => ({
    ...globalThis.stageDemo.active,
    marked: document.querySelector('[data-active]')?.getAttribute('aria-label'),
    ink: globalThis.inkOf(),
  }))
  ok('past 0.5 the incoming scene is active', after.active === 1 && after.marked === 'Rings')
  ok('and the canvas cuts to it', after.ink.hash !== before.ink.hash)
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
  ok('no errors or warnings', page.problems.length === 0, page.problems.join(' | '))
  await page.context().close()
}

await browser.close()
served.close()
console.log(failed ? `\n${failed} failed` : '\nall passed')
process.exit(failed ? 1 : 0)
