import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { br } from './build.mjs'

// What each stack calls the same control. Everything else is the same script.
const L = {
  filter: { 'react-mui': (p) => p.getByRole('searchbox') },
  next: { 'react-mui': (p) => p.getByRole('button', { name: /next page/i }) },
  sort: { 'react-mui': (p) => p.getByRole('columnheader', { name: 'Budget' }) },
  columns: { 'react-mui': (p) => p.getByRole('button', { name: /columns/i }).first() },
}
const busy = async (cdp) => {
  const m = Object.fromEntries(
    (await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]),
  )
  return (m.ScriptDuration + m.RecalcStyleDuration + m.LayoutDuration) * 1000
}
const throttled = async (page) => {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  return cdp
}
const COUNT = () => {
  window.__m = 0
  new MutationObserver(
    (l) =>
      (window.__m += l.reduce(
        (n, r) => n + (r.type === 'childList' ? r.addedNodes.length + r.removedNodes.length : 1),
        0,
      )),
  ).observe(document, { subtree: true, childList: true, attributes: true, characterData: true })
}
const get = (stack, k, p, d) => (L[k]?.[stack] ?? d)(p)
export async function parity(browser, url, stack) {
  const page = await (
    await browser.newContext({ viewport: { width: 1280, height: 900 } })
  ).newPage()
  page.setDefaultTimeout(5000)
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(url)
  await page.getByText('Apollo 0', { exact: true }).first().waitFor()
  await page.evaluate(COUNT)
  const cdp = await throttled(page)
  const out = {}
  const step = async (name, act, check) => {
    try {
      await page.evaluate(() => (window.__m = 0))
      const before = await busy(cdp)
      await act()
      await page.waitForTimeout(400)
      const ms = Math.round((await busy(cdp)) - before)
      const dom = await page.evaluate(() => window.__m)
      const ok = await check()
      out[name] = { ok: !!ok, dom, ms }
    } catch (e) {
      out[name] = { ok: false, error: String(e).slice(0, 140) }
    }
  }
  const text = () => page.locator('body').innerText()
  await tableSteps(page, stack, step, text)
  await detailSteps(page, stack, step, text)
  await page.context().close()
  return { steps: out, errors }
}

async function tableSteps(page, stack, step, text) {
  await step(
    'live cell',
    () => page.evaluate(() => window.__tick()),
    async () => (await text()).includes('$1,001'),
  )
  await step(
    'sort',
    () =>
      get(stack, 'sort', page, (p) =>
        p
          .getByRole('columnheader', { name: /budget/i })
          .getByRole('button')
          .first(),
      ).click(),
    () =>
      page
        .getByRole('columnheader', { name: /budget/i })
        .first()
        .getAttribute('aria-sort')
        .then((v) => v === 'ascending' || v === 'descending'),
  )
  await step(
    'next page',
    () => get(stack, 'next', page, (p) => p.getByRole('button', { name: /^next/i })).click(),
    async () => /21[–-]40/.test(await text()),
  )
  await step(
    'filter',
    () =>
      get(stack, 'filter', page, (p) =>
        p
          .getByRole('searchbox')
          .or(p.getByRole('textbox', { name: /filter/i }))
          .first(),
      ).fill('Juno'),
    async () => (await text()).includes('Juno') && !(await text()).includes('Apollo'),
  )
  await step(
    'clear filter',
    () =>
      get(stack, 'filter', page, (p) =>
        p
          .getByRole('searchbox')
          .or(p.getByRole('textbox', { name: /filter/i }))
          .first(),
      ).fill(''),
    async () => true,
  )
  await step(
    'select row',
    () =>
      page
        .getByRole('checkbox', { name: /select/i })
        .nth(1)
        .check({ force: true }),
    async () => /archive 1/i.test(await text()),
  )
}

async function detailSteps(page, stack, step, text) {
  await step(
    'details open',
    () =>
      page
        .getByRole('button', { name: /details for/i })
        .first()
        .click(),
    async () => /Region/.test(await page.locator('dl').first().innerText()),
  )
  await step(
    'column picker',
    async () => {
      await get(stack, 'columns', page, (p) => p.getByRole('button', { name: /^columns/i })).click()
      await page.waitForTimeout(200)
      await page
        .getByRole('menuitemcheckbox', { name: /owner/i })
        .or(page.locator('[popover] label', { hasText: 'Owner' }))
        .or(page.getByRole('checkbox', { name: /owner/i }))
        .first()
        .click()
    },
    async () => {
      const gone = (await page.getByRole('columnheader', { name: /owner/i }).count()) === 0
      await page.keyboard.press('Escape')
      await page.keyboard.press('Escape')
      return gone
    },
  )
  await step(
    'account menu',
    () =>
      page
        .getByRole('button', { name: /account|ana ruiz|^AR$/i })
        .first()
        .click(),
    async () => /sign out/i.test(await text()),
  )
}

/** The same screen with more rows on the page: what it costs to hold them and to change them. */
export async function scale(browser, url, stack, meta, rows) {
  const out = {}
  for (const size of rows) {
    if (meta[stack].maxRows < size) continue
    const page = await (
      await browser.newContext({ viewport: { width: 1280, height: 900 } })
    ).newPage()
    page.setDefaultTimeout(15000)
    const cdp = await throttled(page),
      loaded = await busy(cdp)
    await page.goto(`${url}?size=${size}`)
    await page.getByText('Apollo 0', { exact: true }).first().waitFor()
    await page.waitForTimeout(800)
    const load = Math.round((await busy(cdp)) - loaded)
    const dom = await page.evaluate(() => {
      const w = document.createTreeWalker(document, -1),
        c = [0, 0, 0]
      let n
      while ((n = w.nextNode())) c[n.nodeType === 1 ? 0 : n.nodeType === 3 ? 1 : 2]++
      return {
        elements: c[0],
        text: c[1],
        comments: c[2],
        rows: document.querySelectorAll('tbody tr, [role="row"][data-id]').length,
      }
    })
    await page.evaluate(COUNT)
    const step = async (act) => {
      await page.evaluate(() => (window.__m = 0))
      const b = await busy(cdp)
      await act()
      await page.waitForTimeout(500)
      return { ms: Math.round((await busy(cdp)) - b), dom: await page.evaluate(() => window.__m) }
    }
    out[size] = {
      load,
      ...dom,
      live: await step(() => page.evaluate(() => window.__tick())),
      select: await step(() =>
        page
          .getByRole('checkbox', { name: /select/i })
          .nth(1)
          .check({ force: true }),
      ),
      sort: await step(() =>
        get(stack, 'sort', page, (p) =>
          p
            .getByRole('columnheader', { name: /budget/i })
            .getByRole('button')
            .first(),
        ).click(),
      ),
    }
    await page.context().close()
  }
  return out
}

// The long list (shared/feed.ts): 10,000 rows of wrapped text at unknown heights, each stack on its usual virtualiser.
const SWEEP_LIST = async ({ step, frames }) => {
  const el = document.getElementById('scroller'),
    clip = el.getBoundingClientRect(),
    frame = () => new Promise(requestAnimationFrame)
  const read = () => {
    const out = new Map()
    for (const r of el.querySelectorAll('[data-row]')) {
      const b = r.getBoundingClientRect()
      if (b.bottom > clip.top && b.top < clip.bottom) out.set(r.dataset.row, b.top)
    }
    return out
  }
  let worst = 0,
    blank = 0,
    most = 0,
    last = read()
  for (let f = 0; f < frames; f++) {
    const before = el.scrollTop
    el.scrollTop = before + step
    await frame()
    const next = read(),
      edge = el.scrollTop <= 0 || el.scrollTop + el.clientHeight >= el.scrollHeight - 1
    if (!edge)
      for (const [k, top] of next)
        if (last.has(k)) worst = Math.max(worst, Math.abs(last.get(k) - top - step))
    if (!next.size) blank++
    most = Math.max(most, document.querySelectorAll('*').length)
    last = next
  }
  return { worstJump: +worst.toFixed(1), blank, elements: most }
}
/** What the page fetched, not what sits in dist: veneer's folder holds the engine for three browsers and every lazy pack. */
export const listResult = (dir, { fetched = [], ...r }) => ({
  ...r,
  loadedBr: fetched.reduce((n, p) => n + br(readFileSync(join(dir, 'feed/dist', p))), 0),
})
export async function longList(browser, url) {
  const page = await (
    await browser.newContext({ viewport: { width: 1280, height: 800 } })
  ).newPage()
  page.setDefaultTimeout(20000)
  const errors = []
  page.on('pageerror', (e) => {
    if (!/ResizeObserver loop/.test(String(e))) errors.push(String(e))
  })
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ResizeObserver loop/.test(m.text()))
      errors.push(m.text().slice(0, 160))
  })
  const fetched = new Set()
  page.on('response', (r) => {
    if (r.ok() && /\.(js|css)$/.test(new URL(r.url()).pathname))
      fetched.add(new URL(r.url()).pathname)
  })
  const cdp = await throttled(page),
    at = await busy(cdp)
  await page.goto(url)
  try {
    await page.locator('[data-row]').first().waitFor()
  } catch {
    await page.context().close()
    return { failed: true, errors }
  }
  await page.waitForTimeout(1500)
  const load = Math.round((await busy(cdp)) - at)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  const a = await busy(cdp)
  const tall = () => page.evaluate(() => document.getElementById('scroller').scrollHeight)
  const height0 = await tall()
  const down = await page.evaluate(SWEEP_LIST, { step: 120, frames: 300 })
  const scrollMs = Math.round((await busy(cdp)) - a)
  const up = await page.evaluate(SWEEP_LIST, { step: -120, frames: 300 })
  const heightMoved = Math.abs((await tall()) - height0) // how wrong the scrollbar was before these rows were seen
  // Jump to a row never rendered: where it lands, and how far the page's total height moves once it has.
  const jump = await page.evaluate(async () => {
    const el = document.getElementById('scroller')
    window.__jump(7777)
    for (let i = 0; i < 40; i++) await new Promise(requestAnimationFrame)
    const row = el.querySelector('[data-row="7777"]')
    return row ? Math.abs(row.getBoundingClientRect().top - el.getBoundingClientRect().top) : null
  })
  await page.context().close()
  return {
    fetched: [...fetched],
    load,
    scrollMs,
    heightMoved,
    downJump: down.worstJump,
    upJump: up.worstJump,
    blank: down.blank + up.blank,
    elements: Math.max(down.elements, up.elements),
    jumpOffBy: jump === null ? null : +jump.toFixed(1),
    errors,
  }
}
