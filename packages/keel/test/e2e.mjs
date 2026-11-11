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

await browser.close()
served.close()
console.log(failed ? `\n${failed} failed` : '\nall passed')
process.exit(failed ? 1 : 0)
