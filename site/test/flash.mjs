// A late sheet must change nothing a visitor can see. Every route, at a desktop and a phone width, with no script, sheets
// held back and then let through: computed styles before and after must match. `node test/flash.mjs [base]`.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const { chromium } = createRequire(new URL('../../packages/veneer/package.json', import.meta.url))(
  'playwright-core',
)
const base = process.argv[2] ?? 'http://localhost:3300'
const read = (f) =>
  JSON.parse(readFileSync(new URL(`../src/generated/${f}.json`, import.meta.url), 'utf8'))
const routes = [
  '/',
  '/examples',
  '/examples/slow',
  '/components',
  '/blocks',
  '/charts',
  '/art',
  '/icons',
  '/nope',
  '/learn',
  '/reference',
  ...Object.keys(read('learn')).map((s) => `/learn/${s}`),
  ...Object.keys(read('reference')).map((s) => `/reference/${s}`),
  ...Object.values(read('toolkit')).map((p) => `/${p.area}/${p.slug}`),
]
const snap = () =>
  [...document.querySelectorAll('body *')]
    .filter((e) => !/^(STYLE|SCRIPT|LINK|TEMPLATE)$/.test(e.tagName))
    .map((e) => {
      const c = getComputedStyle(e),
        o = {
          _: `${e.tagName} ${e.getAttribute('data-scope') ?? e.getAttribute('data-part') ?? ''}`,
        }
      if (e.getAnimations().some((a) => a.playState === 'running')) return o // an entrance, not the sheet
      for (const k of c)
        if (!k.startsWith('--') && !/^(perspective-origin|transform-origin)$/.test(k))
          o[k] = c.getPropertyValue(k)
      return o
    })
const b = await chromium.launch()
let bad = 0
const jobs = [
  [1280, 800],
  [390, 800],
].flatMap(([width, height]) => routes.map((path) => [width, height, path]))
const one = async ([width, height, path]) => {
  const c = await b.newContext({
    viewport: { width, height },
    javaScriptEnabled: false,
    reducedMotion: 'reduce',
  })
  const g = await c.newPage()
  await g.route('**/*.woff2', (r) => r.abort())
  const held = []
  await g.route('**/assets/sheet-*.css', async (r) => {
    await new Promise((go) => {
      held.push(go)
    })
    await r.continue()
  })
  await g.goto(base + path, { waitUntil: 'commit' })
  await g.waitForTimeout(500)
  const before = await g.evaluate(snap)
  held.forEach((go) => go())
  await g.waitForTimeout(150)
  held.forEach((go) => go())
  await g.waitForTimeout(500)
  const after = await g.evaluate(snap)
  const diff = {}
  for (let i = 0; i < Math.min(before.length, after.length); i++)
    for (const k in before[i])
      if (k !== '_' && k in after[i] && before[i][k] !== after[i][k])
        diff[`${before[i]._} ${k}`] = `${before[i][k]} => ${after[i][k]}`.slice(0, 80)
  const n = Object.keys(diff).length
  if (n) {
    bad++
    console.log(
      `${width} ${path}: ${n}`,
      Object.entries(diff)
        .slice(0, 3)
        .map((e) => e.join(': '))
        .join(' | '),
    )
  }
  await c.close()
}
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (jobs.length) await one(jobs.shift())
  }),
) // a few at a time
await b.close()
console.log(`${routes.length * 2} checks, ${bad} changed`)
process.exit(bad ? 1 : 0)
