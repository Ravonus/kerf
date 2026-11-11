// Stills at scroll stops: a viewport PNG at each settled stop with the clock stopped, so the same stop repeats.
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gpuOf, launch, open } from './browser.mjs'
import { scrollAndSettle, sections, stageReady } from './settle.mjs'
import { resolveStop, stopName } from './stops.mjs'

/** Opens `url` and captures a PNG at each stop, with its offset, bytes and SHA-256, into `out` when given. */
export async function capture(options) {
  const browser = options.browser ?? (await launch(options))
  try {
    const page = await open(browser, options)
    await stageReady(page, options.seconds === undefined ? 0 : options.seconds)
    const map = await sections(page, options.sections)
    if (options.out) mkdirSync(options.out, { recursive: true })
    const stills = []
    for (const stop of options.stops ?? [0]) {
      const y = await scrollAndSettle(page, resolveStop(stop, map))
      const png = await page.screenshot({ type: 'png' })
      const name = `${options.name ?? 'still'}-${stopName(stop)}.png`
      const path = options.out ? join(options.out, name) : null
      if (path) writeFileSync(path, png)
      const hash = createHash('sha256').update(png).digest('hex')
      stills.push({ stop, y, name, path, png, bytes: png.length, hash })
    }
    const gpu = await gpuOf(page)
    await page.context().close()
    return { stills, map, gpu, problems: page.problems, browser: browser.version() }
  } finally {
    if (!options.browser) await browser.close()
  }
}
