// What the site's QA pass found, kept found: `node test/qa.mjs [base]` against a running site. Exits 1 on any failure.
// QA_ONLY=<regex> runs only the checks whose names match.
import { createRequire } from 'node:module'

const { chromium } = createRequire(
  new URL('../../packages/veneer/package.json', new URL('../qa.mjs', import.meta.url)),
)('playwright-core')
export const base = process.argv[2] ?? 'http://localhost:3300'
export const b = await chromium.launch()
export const failed = []
export let passed = 0
const only = process.env.QA_ONLY ? new RegExp(process.env.QA_ONLY) : undefined
export const check = async (
  name,
  path,
  test,
  viewport = { width: 1280, height: 900 },
  extra = {},
) => {
  if (only && !only.test(name)) return
  const page = await b.newPage({ viewport, ...extra })
  try {
    await page.goto(base + path, { waitUntil: 'load' })
    await test(page)
    passed++
  } catch (e) {
    failed.push(`${name}: ${e.message.split('\n')[0]}`)
  }
  await page.close()
}
export const same = (got, want, what) => {
  if (String(got) !== String(want)) throw new Error(`${what}: got ${got}, want ${want}`)
}
/** veneer.flow waits for a person: nothing moves until the first scroll. A pixel arms it, as a reader would. */
export const arm = async (page) => {
  await page.mouse.move(640, 300)
  await page.mouse.wheel(0, 1)
  await page.waitForFunction(
    () => document.documentElement.hasAttribute('data-flow-armed'),
    undefined,
    { timeout: 5000 },
  )
}
/** Examples mount as they scroll in, so walk the page until none is waiting. */
export const mount = async (page) => {
  await arm(page)
  for (let i = 0; i < 80; i++) {
    const more = await page.evaluate(() => {
      const m = document.querySelector('[data-part="mount"]:not([data-ready])')
      m?.scrollIntoView()
      return !!m
    })
    if (!more) break
    await page.waitForTimeout(150)
  }
  await page.waitForTimeout(300)
}
export const PHONE = { width: 390, height: 844 }
export const innerHeightOf = (page) => page.viewportSize().height
/** The playground wakes when it's seen, and only then reads the URL. */
export const printed = async (page, match) => {
  await page.locator('[data-play]').scrollIntoViewIfNeeded()
  await page.waitForFunction(
    (m) =>
      new RegExp(m).test(
        document.querySelector('[data-play] > [data-part="code"] pre')?.innerText ?? '',
      ),
    match,
    { timeout: 8000 },
  )
}
