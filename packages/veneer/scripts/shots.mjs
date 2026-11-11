// Photographs the bench (test/bench) at every dial stop, whole page and one tile at a time.
//   node scripts/shots.mjs <out dir> [url] [--stops=balanced/light,...]
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const out = args[0]
const url = args[1] ?? 'http://localhost:3417/bench/'
const only = process.argv
  .find((a) => a.startsWith('--stops='))
  ?.slice(8)
  .split(',')
const stops =
  only ?? ['quiet', 'balanced', 'vivid'].flatMap((e) => ['light', 'dark'].map((t) => `${e}/${t}`))
const browser = await chromium.launch()
for (const stop of stops) {
  const [expression, theme] = stop.split('/')
  const page = await browser.newPage({
    viewport: { width: 1320, height: 900 },
    colorScheme: theme,
    deviceScaleFactor: 1,
  })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(`${url}?expression=${expression}&theme=${theme}`)
  await page.waitForTimeout(1200)
  mkdirSync(out, { recursive: true })
  await page.screenshot({ path: join(out, `${expression}-${theme}.png`), fullPage: true })
  if (errors.length) console.log(stop, errors.slice(0, 3))
  await page.close()
}
await browser.close()
