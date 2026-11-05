import { check, same, mount, PHONE } from './context.mjs'

const loadTiles = async (page) => {
  for (let i = 0; i < 400; i++) {
    const more = await page.evaluate(() => {
      const m = document.querySelector('[data-site="tile"] [data-part="mount"]:not([data-ready])')
      m?.scrollIntoView({ block: 'center' })
      return !!m
    })
    if (!more) break
    await page.waitForTimeout(100)
  }
  await page.waitForTimeout(1200)
}

for (const path of ['/components', '/blocks', '/charts']) {
  await check(
    `hub cards read on a phone ${path}`,
    path,
    async (page) => {
      await loadTiles(page)
      const { cols, bad } = await page.evaluate(() => ({
        cols: getComputedStyle(
          document.querySelector('[data-tk="tiles"]'),
        ).gridTemplateColumns.split(' ').length,
        bad: [...document.querySelectorAll('[data-site="tile"]')].flatMap((t) => {
          const card = t.getBoundingClientRect(),
            stage = t.querySelector('[data-part="stage"]').getBoundingClientRect()
          const name = t.querySelector('[data-part="words"] strong'),
            line = t.querySelector('[data-part="words"] span')
          const out = []
          if (stage.width < card.width - 2)
            out.push(`picture ${Math.round(stage.width)} of ${Math.round(card.width)}px wide`)
          if (stage.height > 242) out.push(`picture ${Math.round(stage.height)}px tall`)
          const drawn = (e) => {
            if (
              !e.firstElementChild ||
              /^(svg|img|canvas|input|textarea|select|video)$/.test(e.localName)
            )
              return true
            const c = getComputedStyle(e)
            return (
              c.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
              parseFloat(c.borderTopWidth) > 0 ||
              parseFloat(c.borderBottomWidth) > 0
            )
          }
          let top = Infinity,
            bottom = -Infinity
          const cover = (r) => {
            if (r.width && r.height) {
              top = Math.min(top, Math.max(r.top, stage.top))
              bottom = Math.max(bottom, Math.min(r.bottom, stage.bottom))
            }
          }
          const holder = t.querySelector('[data-part="mount"]')
          for (const e of holder.querySelectorAll('*'))
            if (
              !(e.closest('svg') && e.localName !== 'svg') &&
              drawn(e) &&
              getComputedStyle(e).visibility !== 'hidden'
            )
              cover(e.getBoundingClientRect())
          const texts = document.createTreeWalker(holder, NodeFilter.SHOW_TEXT)
          for (let n; (n = texts.nextNode());)
            if (n.textContent.trim()) {
              const r = document.createRange()
              r.selectNodeContents(n)
              cover(r.getBoundingClientRect())
            }
          const blank = stage.height - Math.max(0, bottom - top)
          if (blank > 24 && blank > stage.height * 0.4)
            out.push(`${Math.round(blank)} of ${Math.round(stage.height)}px blank`)
          if (!line || !line.textContent.trim() || line.getBoundingClientRect().height < 10)
            out.push('no description')
          else if (parseFloat(getComputedStyle(line).fontSize) < 12)
            out.push(`description at ${getComputedStyle(line).fontSize}`)
          for (const e of [name, line].filter(Boolean)) {
            const r = e.getBoundingClientRect()
            if (r.top < stage.bottom - 1) out.push(`${e.localName} beside the picture`)
            if (r.right > card.right + 1 || r.bottom > card.bottom + 1)
              out.push(`${e.localName} past the card`)
          }
          if (name.scrollWidth > name.clientWidth + 1) out.push('name cut')
          return out.length ? [`${t.dataset.name}: ${out.join(', ')}`] : []
        }),
      }))
      same(cols, 1, 'cards to a row')
      same(bad.join('; '), '', 'cards')
    },
    PHONE,
  )
}
// Docs pages flow like the kit's: their paragraphs, lists and tables are in warp.flow (warp's prose families, with no
// attribute from the build), and below the fold they wait. Check the animation, not markup.
for (const path of ['/reference/rules', '/reference/lists', '/learn/passing-props']) {
  await check(`docs content flows ${path}`, path, async (page) => {
    const { blocks, moving } = await page.evaluate(() => {
      const els = [
        ...document.querySelectorAll(
          '[data-scope="prose"] > :is(p, ul, ol, dl, blockquote, table)',
        ),
      ]
      return {
        blocks: els.length,
        moving: els.filter((e) => getComputedStyle(e).animationName !== 'none').length,
      }
    })
    if (!blocks) throw new Error('no prose blocks in the flow')
    same(moving, blocks, 'blocks animating')
  })
}
// The overlay cards on the hub show the surface open (warp's `inline`), not only the button that opens it.
await check('hub overlay cards show their surface /components', '/components', async (page) => {
  await mount(page)
  const cards = await page.evaluate(() =>
    ['modal', 'drawer', 'popover', 'tooltip']
      .map((name) => {
        const el = document.querySelector(
          `[data-site="tile"][data-name="${name}"] [data-presentation="inline"]`,
        )
        if (!el) return `${name}: no surface`
        const r = el.getBoundingClientRect(),
          s = getComputedStyle(el),
          stage = el.closest('[data-part="mount"]').parentElement.getBoundingClientRect()
        const whole = r.left >= stage.left - 1 && r.right <= stage.right + 1 // the card shows all of its width, nothing cut at the side
        return r.width > 20 &&
          r.height > 10 &&
          whole &&
          +s.opacity === 1 &&
          s.position === 'relative' &&
          !el.matches(':modal, :popover-open')
          ? ''
          : `${name}: ${Math.round(r.width)}x${Math.round(r.height)} ${s.position} ${s.opacity}${whole ? '' : ' cut'}`
      })
      .filter(Boolean),
  )
  same(cards.join('; '), '', 'overlay cards')
})
// A long webhook URL wraps after a slash or before a dot, never mid-word (it broke anywhere).
for (const viewport of [undefined, PHONE]) {
  await check(
    `webhook URLs break at slashes and dots ${viewport ? 'phone' : 'desktop'}`,
    '/blocks/webhooks',
    async (page) => {
      await mount(page)
      const bad = await page.evaluate(() =>
        [...document.querySelectorAll('[data-part="url"]')].flatMap((code) => {
          const text = code.textContent,
            r = document.createRange(),
            out = []
          let top,
            at = 0
          const walk = document.createTreeWalker(code, NodeFilter.SHOW_TEXT)
          for (let n = walk.nextNode(); n; n = walk.nextNode())
            for (let i = 0; i < n.length; i++, at++) {
              r.setStart(n, i)
              r.setEnd(n, i + 1)
              const y = Math.round(r.getClientRects()[0]?.top ?? top)
              if (
                top !== undefined &&
                y > top + 2 &&
                !(/[/&=]/.test(text[at - 1]) || /[.?#]/.test(text[at]))
              )
                out.push(`${text.slice(at - 5, at)}|${text.slice(at, at + 5)}`)
              top = y
            }
          return out
        }),
      )
      same(bad.join(', '), '', 'mid-word breaks')
    },
    viewport,
  )
}
// Thin pages: these had one or two examples and now show the states, sizes and real uses beside them.
for (const [path, least] of [
  ['/components/month-picker', 5],
  ['/components/week-picker', 4],
  ['/components/period-picker', 4],
  ['/components/date-time-field', 5],
  ['/components/command-palette', 5],
  ['/components/radio-group', 5],
  ['/components/number-field', 6],
  ['/components/language-select', 5],
  ['/components/currency-select', 5],
  ['/components/payment-card-input', 3],
  ['/charts/sparkline', 3],
  ['/components/canvas', 11],
]) {
  await check(`enough examples ${path}`, path, async (page) => {
    const n = await page.evaluate(
      () => document.querySelectorAll('[data-site="frame"]:not([data-play])').length,
    )
    if (n < least) throw new Error(`${n} examples, want at least ${least}`)
    await mount(page)
    const broken = await page.evaluate(
      () =>
        [...document.querySelectorAll('[data-part="mount"]')].filter((m) =>
          /failed to load/.test(m.textContent),
        ).length,
    )
    same(broken, 0, 'examples that failed')
  })
}
// Every Canvas example paints something, on screen: a blank or zero-sized canvas is a broken example.
await check('canvas examples draw', '/components/canvas', async (page) => {
  await mount(page)
  const blank = []
  for (const frame of await page
    .locator('[data-site="frame"]:not([data-play]) [data-part="stage"]')
    .all()) {
    await frame.scrollIntoViewIfNeeded()
    await page.waitForTimeout(250)
    blank.push(
      await frame.evaluate((s) => {
        const c = s.querySelector('canvas')
        if (!c || !c.width || !c.height) return `${s.closest('[id]')?.id ?? '?'} has no canvas`
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
        for (let i = 3; i < d.length; i += 4) if (d[i]) return ''
        return `${s.closest('[id]')?.id ?? '?'} is blank`
      }),
    )
  }
  same(blank.filter(Boolean).join(', '), '', 'canvases')
})
// A page with no headings has no contents column, so its words take the room.
for (const path of [
  '/reference/rules',
  '/reference/lists',
  '/reference/async',
  '/reference/browser',
]) {
  await check(
    `no empty contents column ${path}`,
    path,
    async (page) => {
      const { toc, links } = await page.evaluate(() => ({
        toc: document.querySelectorAll('[data-site="toc"]').length,
        links: document.querySelectorAll('[data-site="toc"] a').length,
      }))
      if (toc && !links) throw new Error('an empty contents column')
    },
    { width: 1440, height: 900 },
  )
}
// Learn: the landing and every chapter fit a 375 px phone, open with "You will learn", and end with a pager.
for (const path of [
  '/learn',
  '/learn/quick-start',
  '/learn/installation',
  '/learn/describing-the-ui',
  '/learn/passing-props',
  '/learn/bind',
  '/learn/entries',
  '/learn/effects',
  '/learn/full-stack',
  '/learn/server-functions',
  '/learn/theming',
  '/learn/testing',
]) {
  await check(
    `learn fits 375 px ${path}`,
    path,
    async (page) => {
      await mount(page)
      // Past the viewport, not past clientWidth: a classic scrollbar makes clientWidth narrower than the page can be.
      same(
        await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth)),
        0,
        'page overflow',
      )
    },
    { width: 375, height: 812 },
  )
  if (path === '/learn') continue
  await check(`learn page parts ${path}`, path, async (page) => {
    const parts = await page.evaluate(() => ({
      box: document.querySelector('[data-site="you-will-learn"] li')?.textContent ?? '',
      pager: document.querySelectorAll('[data-part="pager"] a').length,
      nav: !!document.querySelector('[data-scope="sidenav"] nav a[aria-current="page"]'),
    }))
    if (!parts.box) throw new Error('no "You will learn" box')
    same(parts.pager, 2, 'pager links')
    same(parts.nav, true, 'the rail marks this page')
  })
}
// A challenge's solution stays hidden until asked for.
