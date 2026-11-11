// The poster bake: each `poster="bake"` scene draws itself alone with the clock stopped, wide and tall, and each
// still is encoded and listed in a manifest the page's build imports.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { encoders, FIXED, hex, MIME } from '@kerf-js/media/build'
import sharp from 'sharp'
import { launch, open } from './browser.mjs'
import { stageReady } from './settle.mjs'

/** The sizes a poster is drawn at: a wide screen at 1×, and a phone held upright at 2×. */
export const TIERS = {
  desktop: { width: 1440, height: 900, dpr: 1 },
  mobile: { width: 390, height: 844, dpr: 2 },
}

/** In the page: the first stage's scenes whose poster is baked. */
const SCENES = () => {
  const el = document.querySelector('[data-stage]')
  const stage = el && Reflect.get(el, Symbol.for('kerf.stage'))
  if (!stage || stage.tier !== 'live')
    throw new Error('kerf capture: bake needs a page with a <Stage> drawing live scenes')
  return stage.scenes().filter((scene) => scene.bake)
}

/** In the page: one scene alone where its poster is drawn (its hold, else its rest), as a PNG data URL. */
const STILL = ([index, seconds]) => {
  const el = document.querySelector('[data-stage]')
  const stage = Reflect.get(el, Symbol.for('kerf.stage'))
  return stage.still(index, undefined, seconds)
}

/** Encodes one still and describes it as the media record a `?media` import would give. */
async function encode(png, file, how) {
  const image = sharp(png)
  const [{ data, info }, stats, tiny] = await Promise.all([
    encoders[how.format](image.clone(), how.quality).toBuffer({ resolveWithObject: true }),
    image.clone().stats(),
    image.clone().resize(16, 16, { fit: 'inside' }).webp({ quality: 40 }).toBuffer(),
  ])
  const record = {
    kind: 'photo',
    src: file,
    width: info.width,
    height: info.height,
    type: MIME[how.format],
    sources: [],
    dominant: hex(stats.dominant),
    placeholder: `data:image/webp;base64,${tiny.toString('base64')}`,
    name: file,
    quality: 'fixed',
    bytes: data.length,
  }
  return { record, data }
}

/** Bakes the stage's posters at `url` into `out`: `<id>.<tier>.<format>` files and `posters.json`. */
export async function bake(options) {
  const { url, out, format = 'avif', seconds = 0, tiers = TIERS } = options
  const how = { format, quality: options.quality ?? FIXED[format] }
  const browser = options.browser ?? (await launch(options))
  const started = performance.now()
  const posters = {}
  try {
    mkdirSync(out, { recursive: true })
    for (const [tier, size] of Object.entries(tiers)) {
      const page = await open(browser, { url, ...size })
      await stageReady(page, null)
      for (const scene of await page.evaluate(SCENES)) {
        if (!scene.id)
          throw new Error(`kerf capture: scene ${scene.index} bakes a poster but has no id`)
        const shot = performance.now()
        const png = await page.evaluate(STILL, [scene.index, seconds])
        const file = `${scene.id.replace(/[^\w-]+/g, '-')}.${tier}.${format}`
        const { record, data } = await encode(
          Buffer.from(png.split(',')[1] ?? '', 'base64'),
          file,
          how,
        )
        writeFileSync(join(out, file), data)
        ;(posters[scene.id] ??= {})[tier] = { ...record, ms: Math.round(performance.now() - shot) }
      }
      await page.context().close()
    }
  } finally {
    if (!options.browser) await browser.close()
  }
  const manifest = { ...how, seconds, tiers, ms: Math.round(performance.now() - started), posters }
  writeFileSync(join(out, 'posters.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}
