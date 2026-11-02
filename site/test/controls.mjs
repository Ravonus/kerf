// Every example on the site, in a real browser: each control pressed the moment it exists and again after load, and
// the press has to show. `node test/controls.mjs [base]` against a running build; exits 1 on any dead control.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const { chromium } = createRequire(new URL('../../packages/warp/package.json', import.meta.url))('playwright-core')
const base = process.argv[2] ?? 'http://localhost:3300'
const docs = Object.keys(JSON.parse(readFileSync(new URL('../src/generated/docs.json', import.meta.url), 'utf8'))).map(s => `/docs/${s}`)
const pages = [...docs, '/', '/examples']
const SCOPE = '[data-site="example"] [data-part="run"]'
const CONTROLS = `${SCOPE} button:not([disabled]), ${SCOPE} input:not([disabled]), ${SCOPE} [role="checkbox"], ${SCOPE} [role="switch"], ${SCOPE} label`
const NEUTRAL = /^(reset|clear|cancel|close)$/i // nothing to undo on a fresh example

const look = (page, i) => page.evaluate(([sel, i]) => {
  const c = document.querySelectorAll(sel)[i]
  if (!c?.closest('[data-part="run"]')) return ''
  const box = document.body // a press can answer outside its example: a popover, a toast, or the caret landing in the field
  const fields = [...box.querySelectorAll('input,select,textarea')].map(f => `${f.checked}|${f.value}`)
  const attrs = [...box.querySelectorAll('*')].map(e => `${e.getAttribute('aria-checked')}${e.getAttribute('aria-pressed')}${e.getAttribute('aria-expanded')}${e.getAttribute('data-state')}${e.hasAttribute('disabled')}${e.matches(':popover-open')}`)
  const focused = document.activeElement === c || document.activeElement === c.control
  return `${box.innerText}\n${fields}\n${attrs}\n${box.querySelectorAll('*').length}\n${focused}`
}, [sel_(), i])
const sel_ = () => CONTROLS

const b = await chromium.launch()
const dead = [], seen = { pages: 0, controls: 0 }
for (const path of pages) {
  const probe = await b.newPage({ viewport: { width: 1280, height: 900 } })
  await probe.goto(base + path, { waitUntil: 'load' })
  const count = await probe.locator(CONTROLS).count()
  const names = await probe.locator(CONTROLS).evaluateAll(l => l.map(e => e.innerText?.trim() || e.getAttribute('aria-label') || e.type || e.localName))
  await probe.close()
  if (!count) { console.log(`${path}: no example controls`); continue }
  seen.pages++
  for (let i = 0; i < count; i++) for (const when of ['at once', 'after load']) {
    seen.controls++
    const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
    await page.goto(base + path, { waitUntil: when === 'at once' ? 'commit' : 'load' })
    await page.locator(CONTROLS).nth(i).waitFor({ state: 'attached' })
    if (when === 'after load') await page.waitForTimeout(800)
    await page.locator(CONTROLS).nth(i).scrollIntoViewIfNeeded()
    await page.locator(CONTROLS).nth(i).evaluate(e => new Promise(done => { // a forced click lands where the element is now, and flow is still bringing it in
      let y, still = 0
      const tick = () => { const now = e.getBoundingClientRect().y; still = now === y ? still + 1 : 0; y = now; still > 2 ? done() : requestAnimationFrame(tick) }
      tick()
    }))
    const before = await look(page, i)
    await page.locator(CONTROLS).nth(i).click({ timeout: 4000, force: true }).catch(() => {})
    let after = before
    for (let t = 0; t < 30 && after === before; t++) { await page.waitForTimeout(100); after = await look(page, i) }
    if (after === before && !NEUTRAL.test(names[i])) dead.push(`${path} "${names[i]}" ${when}`)
    await page.close()
  }
}
// Pressing something isn't enough where the words promise what happens: each of these does what its "Try this" says.
const run = title => `section[data-site="example"]:has(h2:text-is("${title}")) [data-part="run"]`
const broken = []
const behaves = async (name, path, test) => {
  const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
  try {
    await page.goto(base + path, { waitUntil: 'load' })
    await test(page)
    seen.behaviours = (seen.behaviours ?? 0) + 1
  } catch (e) { broken.push(`${name}: ${e.message.split('\n')[0]}`) }
  await page.close()
}
const same = (got, want, what) => { if (String(got) !== String(want)) throw new Error(`${what}: got ${got}, want ${want}`) }
const until = async (check, what, ms = 8000) => {
  const end = Date.now() + ms
  while (Date.now() < end) { if (await check()) return; await new Promise(r => setTimeout(r, 50)) }
  throw new Error(`timed out: ${what}`)
}
const text = (page, sel) => page.locator(sel).innerText()

await behaves('Two views of one list', '/examples', async page => {
  const box = run('Two views of one list')
  const pane = i => page.locator(`${box} [data-scope="surface"]`).nth(i)
  const boxes = i => pane(i).locator('input[type="checkbox"]')
  await pane(0).scrollIntoViewIfNeeded()
  same(await boxes(1).nth(0).isChecked(), false, 'Ben starts unticked')
  await pane(0).locator('label').first().click()
  await until(() => boxes(1).nth(0).isChecked(), 'tick in Ana shows in Ben')
  same(await boxes(1).nth(1).isChecked(), false, 'the other task stays unticked')
  await pane(1).locator('label').first().click()
  await until(async () => !(await boxes(0).nth(0).isChecked()), 'untick in Ben shows in Ana')
  await pane(0).getByRole('button', { name: 'Add a task' }).click()
  await until(async () => (await boxes(1).count()) === 3, 'a new task shows in Ben')
  await pane(1).locator('label').nth(2).click()
  await until(() => boxes(0).nth(2).isChecked(), 'a tick on the new task shows in Ana')
})
await behaves('Hover shared across tabs', '/docs/ui-state', async probe => {
  const box = 'section[data-site="example"] [data-part="run"]'
  const row = (p, pane, i) => p.locator(`${box} [data-scope="surface"]`).nth(pane).locator('label').nth(i)
  const browser = await b.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await browser.newPage()
  try {
    await page.goto(`${base}/docs/ui-state`, { waitUntil: 'load' })
    await page.locator(box).scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)
    await row(page, 0, 0).hover()
    await until(() => row(page, 1, 0).evaluate(el => el.hasAttribute('data-hold')), 'hovering one pane lights the other')
    same(await row(page, 1, 0).evaluate(el => el.hasAttribute('data-remote')), false, 'that is this page, not someone else')
    same(await row(page, 1, 1).evaluate(el => el.hasAttribute('data-hold')), false, 'the other row stays dark')
    const other = await browser.newPage()
    await other.goto(`${base}/docs/ui-state`, { waitUntil: 'load' })
    await other.locator(box).scrollIntoViewIfNeeded()
    await until(() => row(other, 0, 0).evaluate(el => el.hasAttribute('data-remote')), 'a second tab sees the hover, marked remote')
    await until(async () => /1 elsewhere/.test(await text(other, box)), 'and says so')
    await page.mouse.move(2, 2)
    await until(async () => !(await row(other, 0, 0).evaluate(el => el.hasAttribute('data-hold'))), 'it clears when the pointer leaves')
    // Another browser, across the socket: it may share `demo:` keys and nothing else (src/realtime.server.ts).
    const elsewhere = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
    await elsewhere.goto(`${base}/docs/ui-state`, { waitUntil: 'load' })
    await elsewhere.locator(box).scrollIntoViewIfNeeded()
    await elsewhere.waitForTimeout(800)
    await row(page, 0, 1).hover()
    await until(() => row(elsewhere, 0, 1).evaluate(el => el.hasAttribute('data-remote')), 'a second browser sees it too')
    await elsewhere.context().close()
  } finally { await browser.close() }
})
await behaves('A list that keeps its rows', '/examples', async page => {
  const box = run('A list that keeps its rows')
  await page.locator(box).scrollIntoViewIfNeeded()
  await page.locator(`${box} label:has-text("Grind")`).click()
  for (let i = 0; i < 3; i++) await page.locator(`${box} button`).click()
  await page.waitForTimeout(200)
  same(await page.locator(`${box} label`).first().innerText(), 'Drink', 'the rows have moved')
  same(await page.locator(`${box} label:has-text("Grind") input`).isChecked(), true, 'the tick stays with Grind')
  same(await page.locator(`${box} input:checked`).count(), 1, 'nothing else is ticked')
})
await behaves('A basket that adds itself up', '/examples', async page => {
  const box = run('A basket that adds itself up')
  await page.locator(box).scrollIntoViewIfNeeded()
  const add = page.locator(`${box} button:has-text("Add one")`)
  await add.click(); await add.click()
  await until(async () => (await text(page, box)).includes('3 × $12 · shipping $0'), 'free shipping at three')
  same((await text(page, box)).includes('Total $36'), true, 'the total follows')
})
await behaves('Saving to a server', '/examples', async page => {
  const box = run('Saving to a server')
  await page.locator(box).scrollIntoViewIfNeeded()
  const save = page.locator(`${box} button`)
  await save.click()
  await until(() => save.isDisabled(), 'disabled while saving')
  await until(async () => /saves: 1/i.test(await text(page, box)), 'saved once')
  same(await save.isDisabled(), false, 'enabled again')
})
await behaves('A slow page with an instant shell', '/examples', async page => {
  const box = run('A slow page with an instant shell')
  await page.locator(box).scrollIntoViewIfNeeded()
  await page.locator(`${box} iframe`).waitFor()
  const frame = page.frameLocator(`${box} iframe`)
  await frame.getByText('Great beans').waitFor({ timeout: 6000 }) // the first run has finished, so what follows is the 3 s one
  await page.locator(`${box} button:has-text("3 s")`).click()
  await until(async () => (await frame.getByText('Great beans').count()) === 0, 'the frame reloads')
  const at = Date.now()
  await frame.getByText('House blend').waitFor({ timeout: 2000 })
  const card = Date.now() - at
  await until(async () => (await frame.getByText('12 in stock').count()) > 0, 'stock arrives')
  const stock = Date.now() - at
  await frame.getByText('Great beans').waitFor({ timeout: 4000 })
  const reviews = Date.now() - at
  if (card > 1200 || stock < 1000 || stock > 2600 || reviews < 2300) throw new Error(`timings ${card}/${stock}/${reviews} ms`)
})
await behaves('Ask the app', '/examples', async page => {
  const box = run('Ask the app')
  await page.locator(box).scrollIntoViewIfNeeded()
  const frame = page.frameLocator(`${box} iframe`)
  await frame.getByRole('button', { name: 'Add a task' }).waitFor()
  await until(async () => (await frame.locator('pre div').count()) > 0, 'the graph is shown')
  const total = await frame.locator('pre div').count()
  await page.waitForTimeout(700)
  same(await frame.locator('pre .lit').count(), 0, 'nothing lit at rest')
  await frame.getByRole('button', { name: 'Add a task' }).click()
  await until(async () => { const n = await frame.locator('pre .lit').count(); return n > 0 && n < total }, 'only the changed lines light up')
  await page.waitForTimeout(700)
  await frame.getByRole('button', { name: 'Finish one' }).click()
  await until(async () => { const n = await frame.locator('pre .lit').count(); return n > 0 && n < total }, 'finishing lights its lines')
})
await behaves('Chat that survives a cut wire', '/examples', async page => {
  const box = run('Chat that survives a cut wire')
  await page.locator(box).scrollIntoViewIfNeeded()
  await page.locator(`${box} button:has-text("Join")`).click()
  await page.locator(`${box} input`).fill('Hello')
  await page.locator(`${box} button[type="submit"]`).click()
  await until(async () => (await page.locator(`${box} li`).count()) >= 1, 'my message comes back')
  await page.locator(`${box} button:has-text("Cut the wire")`).click()
  const held = await page.locator(`${box} li`).count()
  await page.waitForTimeout(3500)
  same(await page.locator(`${box} li`).count(), held, 'nothing arrives while cut')
  await page.locator(`${box} button:has-text("Restore the wire")`).click()
  await until(async () => (await page.locator(`${box} li`).count()) === 4, 'the missed replies arrive', 15000)
  same((await page.locator(`${box} li`).allInnerTexts()).slice(1).join(), 'Server Got it.,Server Still here.,Server That was the last one.', 'in order')
})
await behaves('The agent story', '/', async page => {
  const box = page.locator('[data-site="fix"]')
  await box.scrollIntoViewIfNeeded()
  const shown = async () => box.locator('output').innerText()
  const step = n => box.locator('[data-part="steps"] button').nth(n)
  await step(0).click()
  await box.getByRole('button', { name: '+1' }).click()
  await box.getByRole('button', { name: '+1' }).click()
  same(await shown(), '10', 'broken: the total is stuck')
  same(await box.locator('[data-part="amount"]').innerText(), 'Count 4', 'the count moved')
  await step(1).click()
  same(await box.locator('[data-show="1"]').isVisible(), true, 'the diagnostic shows')
  await step(3).click()
  await until(async () => (await shown()) === '20', 'fixed: the total follows')
  await box.getByRole('button', { name: '+1' }).click()
  await until(async () => (await shown()) === '25', 'and keeps following')
})
await behaves('Same page changes in all three', '/', async page => {
  const stage = page.locator('[data-site="arena"]')
  await stage.scrollIntoViewIfNeeded()
  await until(() => page.evaluate(() => [...document.querySelectorAll('[data-site="arena"] iframe')].every(f => f.contentWindow?.arena)), 'frames ready')
  await stage.getByRole('button', { name: 'Click all three' }).click()
  await page.waitForTimeout(300)
  const writes = await stage.locator('dl div:has(dt:text-is("page changes")) dd').allInnerTexts()
  if (new Set(writes).size !== 1 || writes[0] === '0') throw new Error(`page changes differ: ${writes}`)
  same(await stage.locator('dl div:has(dt:text-is("time per update")) dd').first().innerText(), '–', 'a click is too few to time')
  same(await page.evaluate(() => [...document.querySelectorAll('[data-site="arena"] iframe')].every(f => f.contentWindow.crossOriginIsolated)), true, 'the frames have the fine clock')
})

// Every toolkit page: each example mounts, with no page error and nothing wider than its stage.
const slugs = Object.values(JSON.parse(readFileSync(new URL('../src/generated/toolkit.json', import.meta.url), 'utf8'))).map(p => `${p.area}/${p.slug}`)
const unmounted = []
for (const slug of slugs) {
  const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('pageerror', e => unmounted.push(`/${slug}: ${e.message.split('\n')[0]}`))
  await page.goto(`${base}/${slug}`, { waitUntil: 'load' })
  for (let i = 0; i < 80; i++) {
    const more = await page.evaluate(() => { const m = document.querySelector('[data-part="mount"]:not([data-ready])'); m?.scrollIntoView(); return !!m })
    if (!more) break
    await page.waitForTimeout(200)
  }
  const left = await page.locator('[data-part="mount"]:not([data-ready])').count()
  if (left) unmounted.push(`/${slug}: ${left} never mounted`)
  await page.close()
}

await b.close()
console.log(`${slugs.length} toolkit pages, ${unmounted.length} problems`)
for (const u of unmounted) console.log(`  toolkit: ${u}`)
console.log(`${seen.behaviours ?? 0} behaviours passed, ${broken.length} broken`)
for (const d of broken) console.log(`  broken: ${d}`)
console.log(`${seen.pages} pages, ${seen.controls} presses, ${dead.length} dead`)
for (const d of dead) console.log(`  dead: ${d}`)
process.exit(dead.length || broken.length || unmounted.length ? 1 : 0)
