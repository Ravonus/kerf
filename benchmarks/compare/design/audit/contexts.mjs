const SCREENS = ['settings', 'customers', 'pricing']
const VIEWPORTS = [
  [1280, 800],
  [390, 780],
]

export async function auditContexts(browser, url, out, collected, helpers) {
  const { show, settle, axe, focusLoss, collect, merge } = helpers
  const count = (violations) => {
    for (const v of violations) {
      out.axe += v.nodes
      if (v.id === 'color-contrast') out.contrast += v.nodes
      if (v.impact === 'serious' || v.impact === 'critical') out.serious += v.nodes
      out.byRule[v.id] = (out.byRule[v.id] ?? 0) + v.nodes
    }
  }
  for (const scheme of ['light', 'dark'])
    for (const [width, height] of VIEWPORTS)
      await auditContext(browser, url, out, collected, scheme, width, height, {
        show,
        settle,
        axe,
        focusLoss,
        collect,
        merge,
        count,
      })
}

async function auditContext(browser, url, out, collected, scheme, width, height, helpers) {
  const { show, settle, axe, focusLoss, collect, merge, count } = helpers
  const ctx = await browser.newContext({
    viewport: { width, height },
    colorScheme: scheme,
    reducedMotion: 'reduce',
  })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => out.errors.push(String(e).slice(0, 160)))
  for (const screen of SCREENS) {
    await show(page, url, screen)
    count(await axe(page))
    if (
      width === 390 &&
      (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1))
    )
      out.overflow++
    if (width === 1280 && scheme === 'light') {
      const f = await focusLoss(page)
      out.focusStops += f.stops
      out.focusInvisible += f.invisible
      merge(collected, await collect(page))
    }
    if (scheme === 'dark' && width === 1280)
      out.darkFollows += await page.evaluate(() => {
        const l = (v) => {
          const [r, g, b] = v.match(/[\d.]+/g).map(Number)
          return (r + g + b) / 3
        }
        const paint = (e) => {
          for (; e; e = e.parentElement) {
            const c = getComputedStyle(e).backgroundColor
            if (c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c
          }
          return 'rgb(255, 255, 255)'
        }
        return l(paint(document.querySelector('main') ?? document.body)) < 110 ? 1 : 0
      })
  }
  // Two states the resting page doesn't show.
  try {
    await show(page, url, 'settings')
    await page.getByLabel('Email').first().fill('nope')
    await page.getByRole('button', { name: 'Save' }).first().click()
    await settle(page)
    count(await axe(page))
  } catch (e) {
    out.errors.push(`form state: ${String(e).slice(0, 100)}`)
  }
  try {
    await show(page, url, 'customers')
    await page
      .getByRole('button', { name: /delete/i })
      .first()
      .click()
    await settle(page)
    count(await axe(page))
  } catch (e) {
    out.errors.push(`dialog state: ${String(e).slice(0, 100)}`)
  }
  await ctx.close()
}
