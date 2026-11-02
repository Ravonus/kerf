// What the site's QA pass found, kept found: `node test/qa.mjs [base]` against a running site. Exits 1 on any failure.
import { createRequire } from 'node:module'

const { chromium } = createRequire(new URL('../../packages/warp/package.json', import.meta.url))('playwright-core')
const base = process.argv[2] ?? 'http://localhost:3300'
const b = await chromium.launch()
const failed = []
let passed = 0
const check = async (name, path, test, viewport = { width: 1280, height: 900 }) => {
  const page = await b.newPage({ viewport })
  try {
    await page.goto(base + path, { waitUntil: 'load' })
    await test(page)
    passed++
  } catch (e) { failed.push(`${name}: ${e.message.split('\n')[0]}`) }
  await page.close()
}
const same = (got, want, what) => { if (String(got) !== String(want)) throw new Error(`${what}: got ${got}, want ${want}`) }
/** Examples mount as they scroll in, so walk the page until none is waiting. */
const mount = async page => {
  for (let i = 0; i < 80; i++) {
    const more = await page.evaluate(() => { const m = document.querySelector('[data-part="mount"]:not([data-ready])'); m?.scrollIntoView(); return !!m })
    if (!more) break
    await page.waitForTimeout(150)
  }
  await page.waitForTimeout(300)
}
const PHONE = { width: 390, height: 844 }
/** The playground wakes when it's seen, and only then reads the URL. */
const printed = async (page, match) => {
  await page.locator('[data-play]').scrollIntoViewIfNeeded()
  await page.waitForFunction(m => new RegExp(m).test(document.querySelector('[data-play] > [data-part="code"] pre')?.innerText ?? ''), match, { timeout: 8000 })
}

// Long names and wide examples on a phone: the page never scrolls sideways, and nothing leaves its stage.
for (const path of ['/blocks/notification-preferences', '/blocks/push-soft-ask', '/components/inline-calendar', '/blocks/prompt', '/blocks/assistant', '/blocks/tool-call']) {
  await check(`fits a phone ${path}`, path, async page => {
    await mount(page)
    const { page: over, stages } = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      stages: [...document.querySelectorAll('[data-part="stage"]')].flatMap(s => {
        const edge = s.getBoundingClientRect().right
        return [...s.querySelectorAll('[data-scope="calendar"] [data-part="months"], [data-scope="tool-call"], textarea')].filter(e => e.getBoundingClientRect().right > edge + 1).map(e => e.dataset.scope ?? e.dataset.part ?? e.localName)
      }),
    }))
    same(over, 0, 'page overflow')
    same(stages.join(), '', 'past the stage edge')
  }, PHONE)
}

await check('the frame code button opens the code', '/blocks/system-page', async page => {
  const frame = page.locator('[data-site="frame"]').first()
  await frame.scrollIntoViewIfNeeded()
  const code = frame.locator('> [data-part="code"] [data-scope="codeblock"]')
  const shut = (await code.boundingBox()).height
  await frame.getByRole('button', { name: 'View code' }).click()
  if ((await code.boundingBox()).height <= shut) throw new Error('View code did not grow it')
  await frame.getByRole('button', { name: 'Code', exact: true }).click()
  same(await code.isVisible(), true, 'Code view shows the code')
  same(await frame.locator('> [data-part="stage"]').isVisible(), false, 'Code view hides the stage')
})

await check('site frame rules stay off a component\'s own code part', '/blocks/system-page', async page => {
  await mount(page)
  const tops = await page.evaluate(() => [...document.querySelectorAll('[data-site="frame"] [data-part="stage"] [data-part="code"]')].map(c => getComputedStyle(c).borderBlockStartStyle))
  if (!tops.length) throw new Error('no code part on the stage to check')
  same([...new Set(tops)].join(), 'none', 'border')
})

await check('LiveStatus words reach the code', '/components/live-status?children=Streaming', async page => {
  await printed(page, '>Streaming</LiveStatus>')
})

await check('LiveStatus with no words closes itself', '/components/live-status', async page => {
  const text = await page.locator('[data-play] > [data-part="code"] pre').innerText()
  if (!text.includes('/>') || text.includes('{children}') || text.includes('</LiveStatus>')) throw new Error(`printed ${text}`)
})

await check('a numeric knob stays a number from the URL', '/components/pagination-bar?size=100', page => printed(page, 'size=\\{100\\}'))

await check('a mixed knob keeps numbers from the URL and its presets', '/components/grid?cols=4', async page => {
  await printed(page, 'cols=\\{4\\}')
  await page.getByRole('button', { name: 'Thumbnails' }).click()
  await printed(page, 'cols=\\{6\\}')
})

await check('the cols example shows what it labels', '/components/grid', async page => {
  await mount(page)
  const labelled = await page.evaluate(() => [...document.querySelectorAll('[data-scope="grid"][data-cols]')].filter(g => g.previousElementSibling?.textContent === `cols={${g.dataset.cols}}`).map(g => [g.dataset.cols, getComputedStyle(g).gridTemplateColumns.split(' ').length]))
  if (!labelled.length) throw new Error('no labelled grids found')
  for (const [want, got] of labelled) same(got, want, `cols={${want}}`)
})

// A link that goes nowhere is a dead end in an example. Links that switch a demo's own state call preventDefault and move aria-current.
for (const path of ['/components/grid', '/blocks/audit-log', '/blocks/invoices']) {
  await check(`no missing anchors ${path}`, path, async page => {
    await mount(page)
    const dead = await page.evaluate(() => [...document.querySelectorAll('[data-part="stage"] a[href^="#"]:not([href="#"])')].filter(a => !a.matches('[aria-current], nav a') && !document.getElementById(decodeURIComponent(a.hash.slice(1)))).map(a => a.getAttribute('href')))
    same(dead.join(), '', 'missing anchors')
  })
}

await check('the sample invoice exists', '/blocks/invoices', async page => {
  await mount(page)
  const href = await page.locator('[data-part="stage"] a[aria-label^="PDF for"]').first().getAttribute('href')
  same((await page.request.get(base + href)).status(), 200, href)
})

// The arena runs or says it isn't there. It never shows a frame around a 404.
for (const [path, frames] of [['/', '[data-site="arena"] iframe'], ['/examples', '[data-part="ask"]']]) {
  await check(`arena is honest on ${path}`, path, async page => {
    const lost = []
    page.on('response', r => { if (r.url().includes('/arena/') && r.status() >= 400) lost.push(`${r.status()} ${new URL(r.url()).pathname}`) })
    const scope = path === '/' ? page.locator('[data-site="arena"]') : page.locator('section[data-site="example"]:has(h2:text-is("Ask the app"))')
    await scope.scrollIntoViewIfNeeded()
    await page.waitForTimeout(1500)
    same(lost.join(), '', 'frame requests')
    const shown = await scope.locator('iframe').count(), said = await scope.locator('[data-part="missing"]').count()
    if (!shown === !said) throw new Error(`${shown} frames and ${said} notices (${frames})`)
    for (const a of await scope.locator('a[href^="/arena/"]').all()) same((await page.request.get(base + await a.getAttribute('href'))).status(), 200, 'arena link')
  })
}

await b.close()
console.log(`${passed} passed, ${failed.length} failed`)
for (const f of failed) console.log(`  failed: ${f}`)
if (failed.length) process.exit(1)
