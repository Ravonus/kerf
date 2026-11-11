import { check, same, mount } from './context.mjs'

await check('learn challenges hide their solution', '/learn/passing-props', async (page) => {
  const sol = page.locator('[data-site="challenge"] details').first()
  same(await sol.evaluate((d) => d.open), false, 'open at first')
  await sol.locator('summary').click()
  same(await sol.evaluate((d) => d.open), true, 'open after a click')
})
// A Learn demo runs: the stepper writes the parent's box through bind:.
await check('learn bind demo writes the parent', '/learn/bind', async (page) => {
  await mount(page)
  const run = page.locator('[data-site="example"] [data-part="run"]').first()
  await run.getByRole('button', { name: '+' }).click()
  await page.waitForFunction(
    () =>
      /Booked for 3 people/.test(
        document.querySelector('[data-site="example"] [data-part="run"]')?.textContent ?? '',
      ),
    null,
    { timeout: 4000 },
  )
})
// Learn's rail folds: only this page's chapter is open, a heading toggles its chapter, and a viewer's choice is kept.
const RAIL = '[data-scope="sidenav"] nav'
await check('learn rail folds to this chapter', '/learn/bind', async (page) => {
  const folds = page.locator(`${RAIL} button[data-fold]`)
  await page.waitForFunction(
    (r) => document.querySelector(`${r} button[data-fold]`) && localStorage !== undefined,
    RAIL,
  )
  const states = () =>
    folds.evaluateAll((bs) =>
      bs.map((el) => `${el.textContent.trim()}=${el.getAttribute('aria-expanded')}`),
    )
  const open = (await states()).filter((s) => s.endsWith('=true'))
  same(open.join(), '3. Adding interactivity=true', 'open chapters')
  same(
    await page.locator(`${RAIL} a[aria-current="page"]`).isVisible(),
    true,
    'the current link shows',
  )
  const other = folds.filter({ hasText: 'Managing state' })
  await other.click()
  same(await other.getAttribute('aria-expanded'), 'true', 'opened by a click')
  same(
    await page
      .locator(`#${await other.getAttribute('aria-controls')} a`)
      .first()
      .isVisible(),
    true,
    'its pages show',
  )
  await other.focus()
  await page.keyboard.press('Enter')
  same(await other.getAttribute('aria-expanded'), 'false', 'closed by Enter')
  await page.keyboard.press(' ')
  same(await other.getAttribute('aria-expanded'), 'true', 'opened by Space')
  // Closing this page's chapter and reloading opens it again: arriving on a page always shows its link.
  await folds.filter({ hasText: 'Adding interactivity' }).click()
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(800)
  const after = await states()
  same(
    after
      .filter((s) => s.endsWith('=true'))
      .sort()
      .join(),
    ['3. Adding interactivity=true', '4. Managing state=true'].join(),
    'open after a reload',
  )
})
// Every section's rail: every heading has aria-expanded, the section holding this page is the one open, its link is
// marked and in view inside the rail's own scroll, a heading collapses and expands, and the page doesn't move sideways.
for (const [path, section] of [
  ['/learn/effects', '5. Escape hatches'],
  ['/reference/state', null],
  ['/components/button', null],
  ['/blocks', 'Toolkit'],
  ['/charts', 'Toolkit'],
  ['/icons', 'Toolkit'],
  ['/art', 'Toolkit'],
]) {
  await check(`side nav opens this section ${path}`, path, async (page) => {
    await page.waitForSelector(`${RAIL} a[aria-current="page"]`)
    await page.waitForTimeout(500)
    const got = await page.evaluate((r) => {
      const rail = document.querySelector(r)
      const folds = [...rail.querySelectorAll('button[data-fold]')]
      const link = rail.querySelector('a[aria-current="page"]')
      const box = rail.closest('[data-part="scroll"]').getBoundingClientRect(),
        at = link.getBoundingClientRect()
      return {
        sticky: getComputedStyle(rail.closest('[data-scope="sidenav"]')).position,
        missing: folds.filter((f) => !['true', 'false'].includes(f.getAttribute('aria-expanded')))
          .length,
        open: folds
          .filter((f) => f.getAttribute('aria-expanded') === 'true')
          .map((f) => f.textContent.trim()),
        holder: link
          .closest('[data-part="sections"] > li')
          .querySelector('button[data-fold], [data-part="group-label"]')
          ?.textContent.trim(),
        inView: at.top >= box.top - 1 && at.bottom <= box.bottom + 1 && at.height > 0,
        over: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      }
    }, RAIL)
    same(got.sticky, 'sticky', 'the rail sticks')
    same(got.missing, 0, 'headings without aria-expanded')
    same(got.open.length, 1, `open sections (${got.open.join(', ')})`)
    if (section) same(got.holder, section, 'the section holding this page')
    same(got.open[0], got.holder, 'the open section holds this page')
    same(got.inView, true, 'the current link is in view in the rail')
    same(got.over, 0, 'page overflow')
    // By its target, not by its state: a locator that matched "collapsed" would move on once this one opens.
    const id = await page.locator(`${RAIL} button[data-fold]`).first().getAttribute('aria-controls')
    const fold = page.locator(`${RAIL} button[aria-controls="${id}"]`)
    const was = await fold.getAttribute('aria-expanded'),
      flip = was === 'true' ? 'false' : 'true'
    await fold.click()
    same(await fold.getAttribute('aria-expanded'), flip, 'toggled by a click')
    same(await page.locator(`#${id}`).isVisible(), flip === 'true', 'its list follows')
    await fold.click()
    same(await fold.getAttribute('aria-expanded'), was, 'toggled back')
    same(await page.locator(`#${id}`).isVisible(), was === 'true', 'its list follows back')
  })
}
// The long rails have a filter that keeps the matching pages.
for (const [path, word, want] of [
  ['/components/button', 'date', /Date/],
  ['/reference/state', 'state', /state/i],
]) {
  await check(`side nav filters ${path}`, path, async (page) => {
    const box = page.locator('[data-scope="sidenav"] [data-part="filter"]')
    await box.fill(word)
    await page.waitForTimeout(200)
    const names = await page.locator(`${RAIL} a`).allInnerTexts()
    if (!names.length || !names.every((n) => want.test(n)))
      throw new Error(`kept ${names.join(', ')}`)
    await box.fill('')
  })
}
// The contents rail on a Learn page is the toolkit's: veneer's Nav with its accent bar, following the heading in view.
await check(
  'learn contents rail tracks the scroll',
  '/learn/state',
  async (page) => {
    const bar = page.locator('[data-site="toc"] [data-scope="nav"] > [data-part="indicator"]')
    await page.waitForSelector('[data-site="toc"] [data-scope="nav"][data-ready]')
    const at = () => bar.evaluate((el) => el.getBoundingClientRect().top)
    const top = await at()
    same(await bar.evaluate((el) => getComputedStyle(el).opacity), 1, 'the bar shows')
    await page.evaluate(() =>
      document.querySelectorAll('[data-site="doc"] h2')[3]?.scrollIntoView(),
    )
    await page.waitForTimeout(700)
    if (!((await at()) > top)) throw new Error('the bar did not move down with the page')
  },
  { width: 1440, height: 900 },
)
// A deep dive starts closed, and a pitfall is labelled.
await check('learn deep dives start closed', '/learn/components-run-once', async (page) => {
  const dive = page.locator('[data-site="deepdive"]').first()
  same(await dive.evaluate((d) => d.open), false, 'open at first')
  await dive.locator('summary').click()
  same(await dive.evaluate((d) => d.open), true, 'open after a click')
})
// On a phone no list sits above the page: the section's SideNav shows only its collapse bar, a slim strip down the left
// edge that the page starts past, and the header has no menu button. The bar opens the same left panel over the page,
// full height, with the current section open and the site's top links at its head. The bar again, Escape and the
// backdrop each close it, focus goes back to the bar, a heading folds without closing it, focus stays inside while
// it's up, and nothing scrolls sideways.
const PANEL = '[data-scope="sidenav"] > [data-part="panel"]'
const checkPanelOrigin = async (page) => {
  const bar = page.locator(`${PANEL} > [data-part="bar"]`)
  const panel = page.locator(PANEL)
  await bar.waitFor()
  await page.waitForTimeout(600)
  same(await page.locator('[data-site="menu"]').isVisible(), false, 'a header menu button shows')
  const box0 = await panel.boundingBox()
  if (box0 && box0.x + box0.width > 1) throw new Error('the panel shows before it is opened')
  const strip = await bar.boundingBox()
  same(Math.round(strip.x), 0, 'the bar sits on the left edge')
  if (strip.width > 40) throw new Error(`the bar is ${strip.width}px wide`)
  same(Math.round(strip.y + strip.height), 812, 'the bar runs to the foot of the screen')
  const start = await page.evaluate(() =>
    Math.min(
      ...[...document.querySelectorAll('[data-site="docs"] > :not([data-scope="sidenav"])')]
        .filter((e) => e.getClientRects().length > 0)
        .map((e) => e.getBoundingClientRect().left),
    ),
  )
  if (start < strip.x + strip.width) throw new Error(`the page starts at ${start}px, under the bar`)
  same(
    await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth)),
    0,
    'page overflow',
  )
  return { bar, panel }
}
for (const path of ['/learn/bind', '/reference/state', '/components/button', '/blocks']) {
  await check(
    `side nav panel on a phone ${path}`,
    path,
    async (page) => {
      const { bar, panel } = await checkPanelOrigin(page)
      const isOpen = () =>
        page.evaluate(() =>
          document.querySelector('[data-scope="sidenav"]').hasAttribute('data-open'),
        )
      const opened = async () => {
        await bar.click()
        await page.waitForTimeout(400)
        same(await isOpen(), true, 'open after the bar')
      }
      const closed = async (how) => {
        await page.waitForTimeout(400)
        same(await isOpen(), false, `closed by ${how}`)
        same(await bar.getAttribute('aria-expanded'), 'false', `aria-expanded after ${how}`)
        same(
          await page.evaluate(() => document.activeElement?.getAttribute('data-part')),
          'bar',
          `focus back on the bar after ${how}`,
        )
      }
      same(await bar.getAttribute('aria-expanded'), 'false', 'aria-expanded before')
      await opened()
      same(await bar.getAttribute('aria-expanded'), 'true', 'aria-expanded when open')
      same(
        await page.evaluate((p) => !!document.activeElement?.closest(p), PANEL),
        true,
        'focus moves into the panel',
      )
      const box = await panel.boundingBox()
      same(Math.round(box.x), 0, 'the panel sits on the left edge')
      same(Math.round(box.height), 812, 'the panel is full height')
      const edge = await bar.boundingBox()
      if (Math.abs(edge.x - (box.x + box.width)) > 2)
        throw new Error(
          `the bar is at ${edge.x}px, not at the panel's edge (${box.x + box.width}px)`,
        )
      same(await panel.getAttribute('role'), 'dialog', 'role')
      same(
        await panel.locator('nav a[aria-current="page"]').isVisible(),
        true,
        'the current page shows in the panel',
      )
      same(await panel.locator('[data-part="lead"] a').count(), 7, 'the site links at its head')
      const id = await panel
        .locator('button[data-fold][aria-expanded="false"]')
        .first()
        .getAttribute('aria-controls')
        .catch(() => null)
      if (id) {
        const fold = panel.locator(`button[aria-controls="${id}"]`)
        await fold.click()
        same(await fold.getAttribute('aria-expanded'), 'true', 'a heading opens in the panel')
        same(await isOpen(), true, 'the panel stays up')
      }
      for (let i = 0; i < 40; i++) await page.keyboard.press('Tab')
      same(
        await page.evaluate((p) => !!document.activeElement?.closest(p), PANEL),
        true,
        'focus stays in the panel',
      )
      same(
        await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth)),
        0,
        'page overflow with the panel up',
      )
      await bar.click()
      await closed('the bar')
      await opened()
      await page.keyboard.press('Escape')
      await closed('Escape')
      await opened()
      await page.mouse.click(356, 400) // clear of the panel (320 px) and its bar (28 px)
      await closed('a backdrop tap')
    },
    { width: 375, height: 812 },
  )
}
// Docked, the bar folds the rail to a slim strip and the page takes the room; a reload keeps the fold, and the bar
// unfolds it again.
