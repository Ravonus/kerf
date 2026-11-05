import { base, check, same, PHONE } from './context.mjs'

await check('wrapped option buttons stroke closed boxes', '/components/button', async (page) => {
  await page.locator('[data-play]').scrollIntoViewIfNeeded()
  await page.waitForSelector('[data-play] [data-part="knob"] [data-scope="segmented"][data-wrap]')
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)
  const knob = (name) =>
    page.locator('[data-play] [data-part="knob"]', {
      has: page.locator('[data-part="knob-label"]', { hasText: new RegExp(`^\\s*${name}\\s*$`) }),
    })
  const drawn = (l) =>
    l.locator(':scope > [data-part="sweep"]').evaluate((n) => {
      const g = getComputedStyle(n)
      return ['Left', 'Top', 'Right', 'Bottom']
        .filter((s) => parseFloat(g[`border${s}Width`]) > 0)
        .join(' ')
    })
  const open = []
  for (const name of ['Emphasis', 'Tone']) {
    const seg = knob(name).locator(':scope > [data-scope="segmented"]')
    same(await seg.getAttribute('data-wrap'), '', `${name} is laid out as a grid`)
    for (const l of await seg.locator(':scope > label:not(:has(input:checked))').all()) {
      await l.hover()
      await page.waitForTimeout(80)
      const d = await drawn(l)
      if (d !== 'Left Top Right Bottom')
        open.push(`${name} ${(await l.textContent()).trim()}: ${d}`)
    }
  }
  same(open.join('; '), '', 'open-sided strokes')
  const size = await knob('Size').locator(':scope > [data-scope="segmented"] > label').all()
  same(
    await knob('Size').locator(':scope > [data-scope="segmented"]').getAttribute('data-wrap'),
    null,
    'Size on one row',
  )
  same(
    `${await drawn(size[0])} / ${await drawn(size[1])} / ${await drawn(size[size.length - 1])}`,
    'Left Top Bottom / Top Bottom / Top Right Bottom',
    'one row joins',
  )
})
// Every playground's few-option knobs, on a desk and a phone: one row of buttons whose words show whole, or, when they
// can't fit one row, an even grid of equal columns (six as 3×2), never a ragged wrap that ends a row mid-group; when no
// even grid fits, a dropdown in their place. A long list is a dropdown, as above.
for (const viewport of [{ width: 1280, height: 900 }, PHONE]) {
  await check(
    `playground option buttons sit on even rows at ${viewport.width}`,
    '/components',
    async (page) => {
      const { readFileSync } = await import('node:fs')
      const pages = JSON.parse(
        readFileSync(
          new URL('../src/generated/toolkit.json', new URL('../qa.mjs', import.meta.url)),
          'utf8',
        ),
      )
      const paths = Object.values(pages)
        .filter((p) => p.playground?.knobs.some((k) => k.control === 'segmented'))
        .map((p) => `/${p.area}/${p.slug}`)
      if (paths.length < 30) throw new Error(`only ${paths.length} playgrounds with option buttons`)
      const bad = []
      for (const path of paths) {
        await page.goto(base + path, { waitUntil: 'load' })
        await page.locator('#playground').scrollIntoViewIfNeeded()
        await page
          .waitForSelector('#playground [data-part="knob"] > [data-scope="segmented"]', {
            state: 'attached',
            timeout: 8000,
          })
          .catch(() => {})
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(250)
        bad.push(
          ...(await page.evaluate(
            (at) =>
              [
                ...document.querySelectorAll(
                  '#playground [data-part="knob"]:not([hidden]):has(> [data-scope="segmented"])',
                ),
              ].flatMap((k) => {
                const name = `${at} ${k.querySelector('[data-part="knob-label"]').textContent}`
                const seg = k.querySelector(':scope > [data-scope="segmented"]'),
                  pick = k.querySelector('[role="combobox"]')
                const shows = (e) => !!e && e.getClientRects().length > 0
                if (!shows(seg))
                  return shows(pick) ? [] : [`${name}: neither buttons nor a dropdown`]
                if (shows(pick)) return [`${name}: buttons and a dropdown`]
                const room = k.getBoundingClientRect(),
                  items = [...seg.querySelectorAll(':scope > label')]
                const boxes = items.map((l) => l.getBoundingClientRect())
                const out = []
                const cut = items
                  .filter((l, i) => {
                    const t = l.querySelector('[data-part="item"]')
                    return (
                      t.scrollWidth > t.clientWidth + 1 ||
                      boxes[i].right > room.right + 1 ||
                      boxes[i].left < room.left - 1
                    )
                  })
                  .map((l) => l.textContent)
                if (cut.length) out.push(`${cut.join('/')} cut`)
                const tops = [...new Set(boxes.map((bx) => Math.round(bx.top)))]
                if (tops.length > 1) {
                  const per = tops.map((t) => boxes.filter((bx) => Math.round(bx.top) === t))
                  const even =
                    per.every((r) => r.length === per[0].length) &&
                    boxes.every((bx) => Math.abs(bx.width - boxes[0].width) < 1.5) &&
                    per.every((r) => r.every((bx, i) => Math.abs(bx.left - per[0][i].left) < 1.5))
                  if (!even) out.push(`ragged rows ${per.map((r) => r.length).join('+')}`)
                }
                return out.length ? [`${name}: ${out.join(', ')}`] : []
              }),
            path,
          )),
        )
      }
      same(bad.join('; '), '', 'option buttons')
    },
    viewport,
  )
}
// Every prop and event in every API table says what it does. The pages are read as served (the tables are in the
// server's HTML), so one browser page lists the hubs and the rest is fetches. The allowlisted pages are mid-rewrite
// elsewhere; take each off as it lands.
const WORDS_PENDING = new Set([])
await check('every api row has a description', '/components', async (page) => {
  const hrefs = new Set()
  for (const hub of ['/components', '/blocks', '/charts']) {
    if (hub !== '/components') await page.goto(base + hub, { waitUntil: 'load' })
    for (const h of await page
      .locator('a[data-site="tile"][href]')
      .evaluateAll((as) => as.map((a) => a.getAttribute('href'))))
      hrefs.add(h.split('#')[0])
  }
  if (hrefs.size < 150) throw new Error(`only ${hrefs.size} pages listed on the hubs`)
  const text = (html) =>
    html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&[a-z#0-9]+;/g, 'x')
      .trim()
  const empty = []
  let rows = 0
  for (const href of [...hrefs].filter((h) => !WORDS_PENDING.has(h))) {
    const html = await (await fetch(base + href)).text()
    for (const [, row] of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
      const cell = /<td data-label="Description"[^>]*>([\s\S]*?)<\/td>/.exec(row)
      if (!cell) continue
      rows++
      if (!text(cell[1]))
        empty.push(`${href} ${text(/<th\b[^>]*>([\s\S]*?)<\/th>/.exec(row)?.[1] ?? '?')}`)
    }
  }
  if (rows < 1500) throw new Error(`only ${rows} api rows found`)
  same(empty.join(', '), '', 'empty descriptions')
})
// The fold's button is solid and sits under the code, folded or open, so no line runs into it.
await check(
  'view code sits under the code on a phone',
  '/components/select',
  async (page) => {
    const frame = page.locator('[data-site="frame"]:has(> [data-part="code"][data-fold])').first()
    await frame.locator('> [data-part="code"]').scrollIntoViewIfNeeded()
    const clear = () =>
      frame.evaluate((f) => {
        const code = f
            .querySelector(':scope > [data-part="code"] [data-scope="codeblock"]')
            .getBoundingClientRect(),
          button = f.querySelector('[data-act="stage-code"]')
        return {
          gap: Math.round(button.getBoundingClientRect().top - code.bottom),
          solid: !/rgba\(.*, 0\)|transparent/.test(getComputedStyle(button).backgroundColor),
        }
      })
    for (const when of ['folded', 'open']) {
      const { gap, solid } = await clear()
      if (gap < 0) throw new Error(`${when}: the button overlaps the code by ${-gap}px`)
      same(solid, true, `${when}: solid button`)
      if (when === 'folded') await frame.getByRole('button', { name: 'View code' }).click()
    }
  },
  PHONE,
)
// Hub cards: these three previews fit their card (no giant clipped title, no half a table).
await check('hub previews fit their cards', '/blocks', async (page) => {
  const out = []
  for (const name of ['conversation', 'bell', 'rolesmatrix']) {
    const tile = page.locator(`[data-site="tile"][data-name="${name}"]`)
    await tile.scrollIntoViewIfNeeded()
    await page
      .waitForFunction(
        (n) =>
          document.querySelector(
            `[data-site="tile"][data-name="${n}"] [data-part="mount"][data-ready]`,
          ),
        name,
        { timeout: 15000 },
      )
      .catch(() => {
        throw new Error(`${name} never mounted`)
      })
    await page.waitForTimeout(300)
    out.push(
      await tile.evaluate((t, which) => {
        const stage = t.querySelector('[data-part="stage"]').getBoundingClientRect(),
          shown = t.querySelector('[data-part="mount"]').firstElementChild.getBoundingClientRect()
        const fits =
          shown.top >= stage.top - 1 &&
          shown.left >= stage.left - 1 &&
          shown.right <= stage.right + 1 &&
          (which === 'conversation' || shown.bottom <= stage.bottom + 1)
        return fits
          ? ''
          : `${which} ${Math.round(shown.width)}x${Math.round(shown.height)} in ${Math.round(stage.width)}x${Math.round(stage.height)}`
      }, name),
    )
  }
  same(out.filter(Boolean).join(), '', 'previews past their card')
})
// Every hub card is a deliberate picture of its example, at a scale its words can be read (half size or more on a
// desktop, where a card is at least 260px wide and three or fewer to a row; 0.3 or more on a phone, whose one column
// hugs its example): the whole example shrunk to fit, or, when that would be too small, its top at full scale, marked
// as a crop. Never wider than the card, starting at its top (not mid-content), with nothing inside running past the
// card's edge; a chart is never cropped, so it shows the whole chart, not its legend.
for (const path of ['/components', '/blocks', '/charts']) {
  for (const viewport of [{ width: 1280, height: 900 }, PHONE]) {
    await check(
      `hub cards are whole pictures ${path} at ${viewport.width}`,
      path,
      async (page) => {
        for (let i = 0; i < 400; i++) {
          const more = await page.evaluate(() => {
            const m = document.querySelector(
              '[data-site="tile"] [data-part="mount"]:not([data-ready])',
            )
            m?.scrollIntoView({ block: 'center' })
            return !!m
          })
          if (!more) break
          await page.waitForTimeout(100)
        }
        await page.waitForTimeout(1200)
        const least = viewport.width >= 600 ? 0.5 : 0.3
        if (viewport.width >= 1000) {
          const { cols, width } = await page.evaluate(() => ({
            cols: getComputedStyle(
              document.querySelector('[data-tk="tiles"]'),
            ).gridTemplateColumns.split(' ').length,
            width: Math.min(
              ...[...document.querySelectorAll('[data-site="tile"] [data-part="stage"]')].map(
                (s) => s.getBoundingClientRect().width,
              ),
            ),
          }))
          if (cols > 3) throw new Error(`${cols} cards to a row`)
          if (width < 260) throw new Error(`a picture ${Math.round(width)}px wide`)
        }
        const bad = await page.evaluate(
          ([chart, floor]) =>
            [...document.querySelectorAll('[data-site="tile"]')].flatMap((t) => {
              const stage = t.querySelector('[data-part="stage"]'),
                m = t.querySelector('[data-part="mount"]')
              const st = stage.getBoundingClientRect(),
                r = m.getBoundingClientRect()
              const scale = +(/scale\(([\d.]+)\)/.exec(m.style.transform)?.[1] ?? 0),
                crop = m.hasAttribute('data-crop')
              const out = []
              if (!scale) out.push('never fitted')
              else if (scale < floor - 0.005) out.push(`drawn at ${scale.toFixed(2)}`)
              if (crop !== r.bottom > st.bottom + 1)
                out.push(crop ? 'marked cropped but whole' : 'cut off without a crop')
              if (chart && crop) out.push('chart cropped')
              if (r.left < st.left - 1 || r.right > st.right + 1) out.push('wider than the card')
              if (r.top < st.top - 1) out.push('starts above the card')
              // a descendant cut by the card's edge (in it, but running past it), with nothing between them that clips it
              const clips = (e) => {
                for (let p = e.parentElement; p && p !== m; p = p.parentElement)
                  if (getComputedStyle(p).overflowX !== 'visible') return true
                return false
              }
              const past = [...m.querySelectorAll('*')].find((e) => {
                const box = e.getBoundingClientRect()
                return (
                  box.width > 0 &&
                  box.left < st.right &&
                  box.right > Math.min(r.right, st.right) + 2 &&
                  !clips(e)
                )
              })
              if (past)
                out.push(
                  `${past.localName}${past.dataset.part ? `[${past.dataset.part}]` : ''} past its edge`,
                )
              return out.length ? [`${t.dataset.name}: ${out.join(', ')}`] : []
            }),
          [path === '/charts', least],
        )
        same(bad.join('; '), '', 'cards')
      },
      viewport,
    )
  }
}
// On a phone a hub is one card to a row: the picture the card's full width above the name and a readable line or two of
// what it is for, every name and description in full view of its card. The picture hugs its example: no taller than
// 240px (a crop past that), and not a short example in a tall blank box, so the page is long only in proportion to what
// is on it. Blank is the stage's height less the span its drawn things (text, leaves, and boxes with a fill or a border)
// cover.
