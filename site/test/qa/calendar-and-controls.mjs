import { check, same, mount } from './context.mjs'

import { calendarIn } from './demos-and-calendar.mjs'
await check(
  'out-of-hours shading is quiet and the same at both ends',
  '/components/calendar',
  async (page) => {
    const sec = await calendarIn(page, 'CalendarBusyDay', 'Day')
    const m = await sec.evaluate((s) => {
      const col = s.querySelector('[data-part="col"]')
      const off = [...col.querySelectorAll(':scope > [data-part="off-hours"]')].map((o) => ({
        bg: getComputedStyle(o).backgroundImage + getComputedStyle(o).backgroundColor,
        h: o.getBoundingClientRect().height,
      }))
      const strays = [
        ...s.querySelectorAll(
          '[data-part="col"] > :not([data-part="off-hours"], [data-part="event"], [data-part="now"], [data-part="ghost"], [data-part="draft"], [data-part="readout"])',
        ),
      ].map((e) => e.outerHTML.slice(0, 60))
      return { off, strays }
    })
    same(m.off.length, 2, 'shaded spans')
    same(m.off[0].bg === m.off[1].bg, true, 'the evening is shaded like the morning')
    if (/url\(/.test(m.off[1].bg))
      throw new Error(`a picture in the evening: ${m.off[1].bg.slice(0, 80)}`)
    same(m.strays.join(), '', 'other things in a day column')
  },
)
// The Ticker playground's starting value is big enough for en-IN's grouping to show.
await check('ticker shows en-IN grouping', '/components/ticker?locale=en-IN', async (page) => {
  await page.locator('[data-play]').scrollIntoViewIfNeeded()
  await page
    .waitForFunction(
      () =>
        /12,48,120/.test(
          document.querySelector('[data-play] [data-part="stage"]')?.textContent ?? '',
        ),
      null,
      { timeout: 8000 },
    )
    .catch(async () => {
      throw new Error(
        `shows ${await page.locator('[data-play] [data-part="stage"]').textContent()}`,
      )
    })
})
// Related pages are quiet links with their names as words, not loud buttons in squashed capitals.
await check('related links read as words', '/blocks/checkout', async (page) => {
  const links = await page.locator('[data-site="related"] a').evaluateAll((as) =>
    as.map((a) => ({
      text: a.innerText,
      button: a.dataset.scope === 'button',
      upper: getComputedStyle(a).textTransform,
    })),
  )
  if (!links.length) throw new Error('no related links')
  same(
    links
      .filter((l) => l.button || l.upper === 'uppercase' || /[a-z][A-Z]/.test(l.text))
      .map((l) => l.text)
      .join(),
    '',
    'loud or squashed',
  )
})
// Key caps hold keys: "+" and "or" are words between them, and a comma never sits inside a cap ("Enter," was one).
await check('key caps hold keys only', '/components/data-grid', async (page) => {
  const caps = await page
    .locator('#accessibility [data-part="keys"] kbd')
    .evaluateAll((ks) => ks.map((k) => k.textContent.trim()))
  if (!caps.length) throw new Error('no key caps')
  same(caps.filter((k) => k === '+' || k === 'or' || /.,$/.test(k)).join(' '), '', 'not keys')
})
// A desk shows every DataGrid example whole: no column cut behind the edge ("$1,240" showed as "$1,24").
await check('data grid examples fit a desk', '/components/data-grid', async (page) => {
  await mount(page)
  const over = await page.evaluate(() =>
    [...document.querySelectorAll('section[id] [data-scope="table"] > [data-part="viewport"]')]
      .map((v) => ({ id: v.closest('section[id]').id, over: v.scrollWidth - v.clientWidth }))
      .filter((v) => v.over > 1),
  )
  same(over.map((v) => `${v.id} ${v.over}px`).join(', '), '', 'grids wider than their stage')
})
// "Go to" and its box are one item: at 1280 they sit on the pages' row, and never apart.
await check('pagination keeps Go to with its box', '/components/pagination-bar', async (page) => {
  const sec = page.locator('section#PaginationBarControlled')
  await sec.scrollIntoViewIfNeeded()
  await sec.locator('[data-part="jump"]').waitFor()
  const m = await sec.evaluate((s) => {
    const mid = (r) => (r.top + r.bottom) / 2
    const l = s.querySelector('label[for$="-go"]').getBoundingClientRect(),
      i = s.querySelector('[data-part="jump"]').getBoundingClientRect(),
      o = s.querySelector('[data-scope="pagination"] ol').getBoundingClientRect()
    return { pair: Math.abs(mid(l) - mid(i)) < 4, row: Math.abs(mid(o) - mid(i)) < 4 }
  })
  same(m.pair, true, 'Go to beside its box')
  same(m.row, true, 'on the pages row')
})
// The bubble toolbar takes a real click (no closed tooltip lies over it) and stays on the selection as the page scrolls.
await check(
  'bubble toolbar takes a click and follows the selection',
  '/components/rich-text-editor',
  async (page) => {
    const sec = page.locator('section#RichTextEditorBubble')
    await sec.scrollIntoViewIfNeeded()
    await sec.locator('[contenteditable]').waitFor()
    await page.waitForTimeout(300)
    same(
      await page.evaluate(
        () =>
          [...document.querySelectorAll('[popover]')].filter(
            (p) => !p.matches(':popover-open') && getComputedStyle(p).display !== 'none',
          ).length,
      ),
      0,
      'closed popovers laid out',
    )
    await sec.evaluate((s) => {
      const ed = s.querySelector('[contenteditable]'),
        t = ed.querySelector('p').firstChild,
        r = document.createRange()
      ed.focus()
      r.setStart(t, 0)
      r.setEnd(t, 6)
      const sel = getSelection()
      sel.removeAllRanges()
      sel.addRange(r)
    })
    await page.waitForTimeout(250)
    const gap = () =>
      sec.evaluate((s) => {
        const bar = s.querySelector('[role="toolbar"]').getBoundingClientRect(),
          r = getSelection().getRangeAt(0).getBoundingClientRect()
        return Math.round(r.top - bar.bottom)
      })
    const before = await gap()
    const bold = sec.locator('[aria-label="Bold"]')
    const r = await bold.boundingBox()
    await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2)
    await page.waitForTimeout(150)
    same(await bold.getAttribute('aria-pressed'), 'true', 'Bold pressed')
    await page.mouse.wheel(0, 200)
    await page.waitForTimeout(300)
    const after = await gap()
    if (Math.abs(after - before) > 2)
      throw new Error(`toolbar drifted from the selection: ${before}px then ${after}px`)
  },
)
// Esc in the palette clears the query, then goes up a level, then closes, as its docs say.
await check(
  'palette Esc steps back before it closes',
  '/components/command-palette',
  async (page) => {
    const sec = page.locator('section#CommandPaletteNested')
    await sec.scrollIntoViewIfNeeded()
    await sec.locator('button', { hasText: 'Search commands' }).click()
    const input = page.locator('dialog[open] [role="combobox"]')
    await input.waitFor()
    const open = () =>
      page.evaluate(() => !!document.querySelector('dialog[data-scope="palette"][open]'))
    await input.fill('Dep')
    await page.keyboard.press('Escape')
    same(await input.inputValue(), '', 'query after Esc')
    same(await open(), true, 'open after clearing')
    await input.fill('Move')
    await page.keyboard.press('Enter')
    await input.fill('us')
    await page.keyboard.press('Escape')
    same(await input.inputValue(), '', 'level query after Esc')
    same(
      await page
        .locator('dialog[open] [role="option"]')
        .first()
        .textContent()
        .then((t) => /us|eu|ap/i.test(t)),
      true,
      'still in the level',
    )
    await page.keyboard.press('Escape')
    same(await open(), true, 'open after going up')
    same(
      await page
        .locator('dialog[open] [role="option"]')
        .first()
        .textContent()
        .then((t) => /Move storefront/.test(t)),
      true,
      'back at the top',
    )
    await page.keyboard.press('Escape')
    same(await open(), false, 'closed by the last Esc')
  },
)
// The nested level says where you are ("Region ›" before the query), and "us" finds the us regions only.
await check(
  'palette level names itself and matches tightly',
  '/components/command-palette',
  async (page) => {
    const sec = page.locator('section#CommandPaletteNested')
    await sec.scrollIntoViewIfNeeded()
    await sec.locator('button', { hasText: 'Search commands' }).click()
    const input = page.locator('dialog[open] [role="combobox"]')
    await input.waitFor()
    same(
      await page.locator('dialog[open] [data-part="crumb"]').count(),
      0,
      'a name at the top level',
    )
    await input.fill('Move')
    await page.keyboard.press('Enter')
    const crumb = page.locator('dialog[open] [data-part="crumb"]')
    await crumb.waitFor()
    same(/Region/.test(await crumb.innerText()), true, 'the level is named')
    const order = await page.evaluate(() => {
      const c = document.querySelector('dialog[open] [data-part="crumb"]').getBoundingClientRect(),
        i = document.querySelector('dialog[open] [role="combobox"]').getBoundingClientRect()
      return c.right <= i.left + 1 && Math.abs((c.top + c.bottom) / 2 - (i.top + i.bottom) / 2) < 4
    })
    same(order, true, 'the name sits before the query, on its line')
    await input.fill('us')
    await page.waitForTimeout(100)
    const shown = await page.locator('dialog[open] [role="option"]:visible').allInnerTexts()
    if (!shown.length || shown.some((t) => !/\bus-/.test(t)))
      throw new Error(`"us" shows ${shown.join(', ')}`)
  },
)
// A phone week keeps seven readable days and scrolls sideways; the all-day event keeps its name; month chips ellipsize.
await check(
  'calendar week reads on a phone',
  '/components/calendar',
  async (page) => {
    const sec = page.locator('section#preview') // the Editable week
    await sec.scrollIntoViewIfNeeded()
    await sec.locator('[data-part="col"]').first().waitFor()
    await page.waitForTimeout(300)
    const m = await sec.evaluate((s) => {
      const cols = [...s.querySelectorAll('[data-part="col"]')].map(
        (c) => c.getBoundingClientRect().width,
      )
      const chip = s.querySelector('[data-part="allday"] [data-part="chip"]')
      return {
        days: cols.length,
        min: Math.min(...cols),
        chipFont: chip ? parseFloat(getComputedStyle(chip).fontSize) : 0,
      }
    })
    same(m.days, 7, 'days')
    if (m.min < 120) throw new Error(`a day is ${Math.round(m.min)}px wide`)
    if (m.chipFont < 10) throw new Error('the all-day event is a bare dot')
  },
  { width: 390, height: 844 },
)
await check('month chips ellipsize', '/components/calendar', async (page) => {
  const sec = page.locator('section#CalendarMonth')
  await sec.scrollIntoViewIfNeeded()
  await sec.locator('[data-part="day-cell"]').first().waitFor()
  await page.waitForTimeout(300)
  const bad = await sec.evaluate((s) =>
    [...s.querySelectorAll('[data-part="day-cell"] [data-part="chip"]')]
      .filter(
        (c) => c.scrollWidth > c.clientWidth + 1 && getComputedStyle(c).textOverflow !== 'ellipsis',
      )
      .map((c) => c.textContent),
  )
  same(bad.join(), '', 'chips cut without an ellipsis')
})
// Vivid buttons work like Keel's: flat at rest, pulled up and left off a hard offset under the hand, set back down by a press.
await check(
  'vivid buttons pull out on hover',
  '/components/button?expression=vivid',
  async (page) => {
    const btn = page
      .locator('[data-part="mount"] [data-scope="button"]:not([data-emphasis])')
      .first()
    await btn.scrollIntoViewIfNeeded()
    await page.waitForTimeout(1200)
    const look = () =>
      btn.evaluate((e) => {
        const c = getComputedStyle(e)
        return {
          t: c.translate,
          off: c.boxShadow
            .match(/(-?[\d.]+)px (-?[\d.]+)px 0px 0px/)
            ?.slice(1, 3)
            .join(' '),
        }
      })
    same((await look()).off, '0 0', 'offset at rest')
    const box = await btn.boundingBox()
    await page.mouse.move(box.x + 8, box.y + box.height / 2)
    await page.waitForTimeout(700)
    const over = await look()
    same(over.t, '-2px -2px', 'hover moves up and left')
    if (over.off === '0 0') throw new Error('hover shows no offset')
    // the offset is the page's opposite: black on light, white on dark
    const shade = () =>
      btn.evaluate((e) => {
        const g = document.createElement('canvas').getContext('2d')
        g.fillStyle = getComputedStyle(e).boxShadow.match(/^(.*?\)) -?[\d.]+px/)[1]
        g.fillRect(0, 0, 1, 1)
        return [...g.getImageData(0, 0, 1, 1).data.slice(0, 3)].join()
      })
    const dark = await page.evaluate(
      () =>
        matchMedia('(prefers-color-scheme: dark)').matches ||
        document.documentElement.dataset.theme === 'dark',
    )
    same(await shade(), dark ? '255,255,255' : '0,0,0', 'offset colour')
    await page.mouse.down()
    await page.waitForTimeout(100)
    same((await look()).off, '0 0', 'press sets it down')
    await page.mouse.up()
  },
)

// The fill wipes in from the left by default; only a button with `follow` spreads from the pointer.
