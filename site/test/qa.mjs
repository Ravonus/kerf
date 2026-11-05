// What the site's QA pass found, kept found: `node test/qa.mjs [base]` against a running site. Exits 1 on any failure.
// QA_ONLY=<regex> runs only the checks whose names match.
import { createRequire } from 'node:module'

const { chromium } = createRequire(new URL('../../packages/warp/package.json', import.meta.url))(
  'playwright-core',
)
const base = process.argv[2] ?? 'http://localhost:3300'
const b = await chromium.launch()
const failed = []
let passed = 0
const only = process.env.QA_ONLY ? new RegExp(process.env.QA_ONLY) : undefined
const check = async (name, path, test, viewport = { width: 1280, height: 900 }, extra = {}) => {
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
const same = (got, want, what) => {
  if (String(got) !== String(want)) throw new Error(`${what}: got ${got}, want ${want}`)
}
/** warp.flow waits for a person: nothing moves until the first scroll. A pixel arms it, as a reader would. */
const arm = async (page) => {
  await page.mouse.move(640, 300)
  await page.mouse.wheel(0, 1)
  await page.waitForFunction(
    () => document.documentElement.hasAttribute('data-flow-armed'),
    undefined,
    { timeout: 5000 },
  )
}
/** Examples mount as they scroll in, so walk the page until none is waiting. */
const mount = async (page) => {
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
const PHONE = { width: 390, height: 844 }
const innerHeightOf = (page) => page.viewportSize().height
/** The playground wakes when it's seen, and only then reads the URL. */
const printed = async (page, match) => {
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

// Long names and wide examples on a phone: the page never scrolls sideways, and nothing leaves its stage.
for (const path of [
  '/blocks/notification-preferences',
  '/blocks/push-soft-ask',
  '/components/inline-calendar',
  '/blocks/prompt',
  '/blocks/assistant',
  '/blocks/tool-call',
]) {
  await check(
    `fits a phone ${path}`,
    path,
    async (page) => {
      await mount(page)
      const { page: over, stages } = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        stages: [...document.querySelectorAll('[data-part="stage"]')].flatMap((s) => {
          const edge = s.getBoundingClientRect().right
          return [
            ...s.querySelectorAll(
              '[data-scope="calendar"] [data-part="months"], [data-scope="tool-call"], textarea',
            ),
          ]
            .filter((e) => e.getBoundingClientRect().right > edge + 1)
            .map((e) => e.dataset.scope ?? e.dataset.part ?? e.localName)
        }),
      }))
      // Below 0 is no overflow: headless Chromium hides scrollbars but html's `scrollbar-gutter: stable` still keeps
      // their 15px, so the content is narrower than clientWidth reports. Only a positive difference scrolls sideways.
      same(Math.max(0, over), 0, 'page overflow')
      same(stages.join(), '', 'past the stage edge')
    },
    PHONE,
  )
}

await check('the frame code button opens the code', '/blocks/system-page', async (page) => {
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

await check(
  "site frame rules stay off a component's own code part",
  '/blocks/system-page',
  async (page) => {
    await mount(page)
    const tops = await page.evaluate(() =>
      [
        ...document.querySelectorAll('[data-site="frame"] [data-part="stage"] [data-part="code"]'),
      ].map((c) => getComputedStyle(c).borderBlockStartStyle),
    )
    if (!tops.length) throw new Error('no code part on the stage to check')
    same([...new Set(tops)].join(), 'none', 'border')
  },
)

await check(
  'LiveStatus words reach the code',
  '/components/live-status?children=Streaming',
  async (page) => {
    await printed(page, '>Streaming</LiveStatus>')
  },
)

await check('LiveStatus with no words closes itself', '/components/live-status', async (page) => {
  const text = await page.locator('[data-play] > [data-part="code"] pre').innerText()
  if (!text.includes('/>') || text.includes('{children}') || text.includes('</LiveStatus>'))
    throw new Error(`printed ${text}`)
})

await check(
  'a numeric knob stays a number from the URL',
  '/components/pagination-bar?size=100',
  (page) => printed(page, 'size=\\{100\\}'),
)

await check(
  'a mixed knob keeps numbers from the URL and its presets',
  '/components/grid?cols=4',
  async (page) => {
    await printed(page, 'cols=\\{4\\}')
    await page.getByRole('button', { name: 'Thumbnails' }).click()
    await printed(page, 'cols=\\{6\\}')
  },
)

await check('the cols example shows what it labels', '/components/grid', async (page) => {
  await mount(page)
  const labelled = await page.evaluate(() =>
    [...document.querySelectorAll('[data-scope="grid"][data-cols]')]
      .filter((g) => g.previousElementSibling?.textContent === `cols={${g.dataset.cols}}`)
      .map((g) => [g.dataset.cols, getComputedStyle(g).gridTemplateColumns.split(' ').length]),
  )
  if (!labelled.length) throw new Error('no labelled grids found')
  for (const [want, got] of labelled) same(got, want, `cols={${want}}`)
})

// A link that goes nowhere is a dead end in an example. Links that switch a demo's own state call preventDefault and move aria-current.
for (const path of ['/components/grid', '/blocks/audit-log', '/blocks/invoices']) {
  await check(`no missing anchors ${path}`, path, async (page) => {
    await mount(page)
    const dead = await page.evaluate(() =>
      [...document.querySelectorAll('[data-part="stage"] a[href^="#"]:not([href="#"])')]
        .filter(
          (a) =>
            !a.matches('[aria-current], nav a') &&
            !document.getElementById(decodeURIComponent(a.hash.slice(1))),
        )
        .map((a) => a.getAttribute('href')),
    )
    same(dead.join(), '', 'missing anchors')
  })
}

await check('the sample invoice exists', '/blocks/invoices', async (page) => {
  await mount(page)
  const href = await page
    .locator('[data-part="stage"] a[aria-label^="PDF for"]')
    .first()
    .getAttribute('href')
  same((await page.request.get(base + href)).status(), 200, href)
})

// The arena runs or says it isn't there. It never shows a frame around a 404.
for (const [path, frames] of [
  ['/', '[data-site="arena"] iframe'],
  ['/examples', '[data-part="ask"]'],
]) {
  await check(`arena is honest on ${path}`, path, async (page) => {
    const lost = []
    page.on('response', (r) => {
      if (r.url().includes('/arena/') && r.status() >= 400)
        lost.push(`${r.status()} ${new URL(r.url()).pathname}`)
    })
    const scope =
      path === '/'
        ? page.locator('[data-site="arena"]')
        : page.locator('section[data-site="example"]:has(h2:text-is("Ask the app"))')
    await scope.scrollIntoViewIfNeeded()
    await page.waitForTimeout(1500)
    same(lost.join(), '', 'frame requests')
    const shown = await scope.locator('iframe').count(),
      said = await scope.locator('[data-part="missing"]').count()
    if (!shown === !said) throw new Error(`${shown} frames and ${said} notices (${frames})`)
    for (const a of await scope.locator('a[href^="/arena/"]').all())
      same(
        (await page.request.get(base + (await a.getAttribute('href')))).status(),
        200,
        'arena link',
      )
  })
}

// The contents list reaches the last heading at the end of a page, and comes back.
await check('scroll spy reaches the end', '/learn/installation', async (page) => {
  const current = () => page.locator('[data-site="toc"] [aria-current]').innerText()
  const first = await current()
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
  await page.waitForTimeout(400)
  const last = await page.locator('[data-site="toc"] a').last().innerText()
  same(await current(), last, 'at the end')
  await page.evaluate(() => scrollTo(0, 0))
  await page.waitForTimeout(400)
  same(await current(), first, 'back at the top')
})

// The size control draws at the size it says, in a build too (where `[data-size=…]` rules are purged), and names show whole.
await check('icon sizes reach the drawings', '/icons', async (page) => {
  await page.waitForSelector('[data-site="icons"] [data-part="cell"] svg path', {
    state: 'attached',
  })
  for (const size of ['16', '24', '32']) {
    await page.locator(`[data-site="icons"] input[value="${size}"]`).click()
    await page.waitForTimeout(300)
    const { drawn, cut, split } = await page.evaluate(() => {
      const cells = [...document.querySelectorAll('[data-site="icons"] [data-part="cell"]')]
      // Each piece of a name between hyphens is its own text node: one that takes two lines broke mid-word.
      const range = document.createRange()
      const broken = (n) =>
        [...n.childNodes].some((t) => {
          if (t.nodeType !== 3) return false
          range.selectNodeContents(t)
          return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size > 1
        })
      return {
        drawn: cells[0].querySelector('svg').getBoundingClientRect().width,
        cut: cells
          .filter((c) => {
            const n = c.querySelector('[data-part="name"]')
            return (
              n.scrollWidth > n.clientWidth + 1 ||
              n.getBoundingClientRect().bottom > c.getBoundingClientRect().bottom + 1
            )
          })
          .map((c) => c.ariaLabel),
        split: cells
          .filter((c) => broken(c.querySelector('[data-part="name"]')))
          .map((c) => c.ariaLabel),
      }
    })
    same(drawn, size, `drawn at ${size}`)
    same(cut.join(), '', `names cut at ${size}`)
    same(split.join(), '', `names broken mid-word at ${size}`)
  }
})
// API tables: on a phone each prop stacks (no sideways scroll, no description pushed off the side); everywhere,
// backticks are code and an unknown default says so with a dash.
for (const path of ['/components/slider', '/components/modal', '/blocks/checkout']) {
  await check(
    `api table stacks on a phone ${path}`,
    path,
    async (page) => {
      await page.locator('#api-reference').scrollIntoViewIfNeeded()
      const over = await page.evaluate(() =>
        [...document.querySelectorAll('[data-site="props"]')]
          .map((p) => p.scrollWidth - p.clientWidth)
          .filter((n) => n > 0),
      )
      same(over.join(), '', 'sideways overflow')
    },
    PHONE,
  )
}
for (const path of ['/components/dither', '/components/select', '/charts/line-chart']) {
  await check(`api words render code ${path}`, path, async (page) => {
    const { ticks, blank, code } = await page.evaluate(() => {
      const cells = [...document.querySelectorAll('[data-site="props"] tbody td')]
      return {
        ticks: cells.filter((c) => c.textContent.includes('`')).length,
        blank: cells.filter((c) => c.dataset.label === 'Default' && !c.textContent.trim()).length,
        code: document.querySelectorAll('[data-site="props"] td[data-label="Description"] code')
          .length,
      }
    })
    same(ticks, 0, 'cells with raw backticks')
    same(blank, 0, 'empty Default cells')
    if (!code) throw new Error('no code in any description')
  })
}
// A knob with a few options is a button per option, and every one of them is on screen inside the panel; a long list
// is a dropdown. On a desk the panel is at least 300px, and Button's six emphases and six tones take two even rows.
for (const viewport of [{ width: 1280, height: 900 }, PHONE]) {
  await check(
    `few options are buttons at ${viewport.width}`,
    '/components/button',
    async (page) => {
      await page.locator('[data-play]').scrollIntoViewIfNeeded()
      await page.waitForSelector('[data-play] [data-part="knob"] [data-scope="segmented"]')
      await page.waitForTimeout(400)
      const knobs = await page.evaluate(() =>
        [...document.querySelectorAll('[data-play] [data-part="knob"]:not([hidden])')].map((k) => {
          const seg = k.querySelector('[data-scope="segmented"]'),
            panel = k.getBoundingClientRect()
          const out = seg
            ? [...seg.querySelectorAll('label')]
                .filter((l) => {
                  const r = l.getBoundingClientRect()
                  return r.width < 8 || r.left < panel.left - 1 || r.right > panel.right + 1
                })
                .map((l) => l.textContent)
            : []
          const shows = (e) => !!e && e.getClientRects().length > 0
          return {
            label: k.querySelector('[data-part="knob-label"], label')?.textContent?.trim(),
            seg: shows(seg),
            options: seg?.querySelectorAll('label').length ?? 0,
            select: shows(k.querySelector('[role="combobox"]')),
            out,
          }
        }),
      )
      for (const name of ['Emphasis', 'Tone', 'Size']) {
        const k = knobs.find((x) => x.label === name)
        if (!k) throw new Error(`no ${name} knob`)
        same(k.seg && !k.select, true, `${name} is a button per option`)
        same(k.out.join(), '', `${name} options off the panel`)
      }
      if (viewport.width === 1280) {
        const { panel, rows } = await page.evaluate(() => ({
          panel: document.querySelector('[data-play] [data-part="knobs"]').getBoundingClientRect()
            .width,
          rows: Object.fromEntries(
            [
              ...document.querySelectorAll(
                '[data-play] [data-part="knob"]:has(> [data-scope="segmented"])',
              ),
            ].map((k) => [
              k.querySelector('[data-part="knob-label"]').textContent,
              new Set(
                [...k.querySelectorAll('[data-scope="segmented"] > label')].map((l) =>
                  Math.round(l.getBoundingClientRect().top),
                ),
              ).size,
            ]),
          ),
        }))
        if (panel < 300) throw new Error(`a ${Math.round(panel)}px panel`)
        same(`${rows.Emphasis} ${rows.Tone}`, '2 2', 'rows of Emphasis and Tone')
      }
    },
    viewport,
  )
}
// A group laid out as an even grid is rows of items in their own cells, not one joined row: each option hovered strokes
// its whole box ("ghost" and "caution" start row two, and drew only their top and bottom). One row still joins.
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
        readFileSync(new URL('../src/generated/toolkit.json', import.meta.url), 'utf8'),
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
for (const path of ['/components', '/blocks', '/charts']) {
  await check(
    `hub cards read on a phone ${path}`,
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
// The contents rail on a Learn page is the toolkit's: warp's Nav with its accent bar, following the heading in view.
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
for (const path of ['/learn/bind', '/reference/state', '/components/button', '/blocks']) {
  await check(
    `side nav panel on a phone ${path}`,
    path,
    async (page) => {
      const bar = page.locator(`${PANEL} > [data-part="bar"]`)
      const panel = page.locator(PANEL)
      await bar.waitFor()
      await page.waitForTimeout(600)
      same(
        await page.locator('[data-site="menu"]').isVisible(),
        false,
        'a header menu button shows',
      )
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
      if (start < strip.x + strip.width)
        throw new Error(`the page starts at ${start}px, under the bar`)
      same(
        await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth)),
        0,
        'page overflow',
      )
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
for (const path of ['/learn/state', '/components/button']) {
  await check(`side nav folds on a desktop ${path}`, path, async (page) => {
    const nav = page.locator('[data-site="docs"] > [data-scope="sidenav"]')
    const bar = nav.locator('[data-part="bar"]')
    const tracks = () =>
      page.evaluate(() =>
        getComputedStyle(document.querySelector('[data-site="docs"]'))
          .gridTemplateColumns.split(' ')
          .map(parseFloat),
      )
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-scope="sidenav"] [data-part="bar"]')
          ?.getAttribute('aria-expanded') === 'true',
    )
    const [side0, page0] = await tracks()
    if (side0 < 200) throw new Error(`the rail is ${side0}px before folding`)
    same(
      await nav.locator('nav a[aria-current="page"]').isVisible(),
      true,
      'the current link shows',
    )
    await bar.click()
    await page.waitForTimeout(600)
    same(await bar.getAttribute('aria-expanded'), 'false', 'aria-expanded when folded')
    const [side1, page1] = await tracks()
    if (side1 > 40) throw new Error(`the folded rail is ${side1}px`)
    if (page1 - page0 < side0 - side1 - 1)
      throw new Error(`the page grew ${page1 - page0}px of ${side0 - side1}`)
    same(await nav.locator('nav a[aria-current="page"]').isVisible(), false, 'the links hide')
    same(
      await page.evaluate(() => document.activeElement?.getAttribute('data-part')),
      'bar',
      'focus stays on the bar',
    )
    same(
      await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth)),
      0,
      'page overflow',
    )
    await page.reload({ waitUntil: 'load' })
    await page.waitForTimeout(600)
    same(await bar.getAttribute('aria-expanded'), 'false', 'folded after a reload')
    same(Math.round((await tracks())[0]), Math.round(side1), 'the rail width after a reload')
    await bar.click()
    await page.waitForTimeout(600)
    same(await bar.getAttribute('aria-expanded'), 'true', 'unfolded by the bar')
    same(Math.round((await tracks())[0]), Math.round(side0), 'the rail width unfolded')
    same(
      await nav.locator('nav a[aria-current="page"]').isVisible(),
      true,
      'the current link shows again',
    )
  })
}
// The Forecast demo shows its wait: the Boundary's fallback on the first load, then the old forecast dimmed with a
// spinner while the next one loads, and quick presses cancel the requests before them.
await check('learn forecast shows it is waiting', '/learn/async-and-loading', async (page) => {
  await mount(page)
  const run = page
    .locator('[data-site="example"] [data-part="run"]')
    .filter({ hasText: 'Forecast' })
    .first()
  const next = run.getByRole('button', { name: 'Next day' })
  await next.click()
  await run.getByText('Loading…').waitFor({ timeout: 2000 })
  await run.getByText(/Day 1:/).waitFor({ timeout: 3000 })
  await next.click()
  await run.locator('p[aria-busy="true"]').waitFor({ timeout: 1000 })
  same(
    await run.getByText(/Day 1:/).isVisible(),
    true,
    'the old forecast stays while the next loads',
  )
  await next.click()
  await next.click()
  await run.getByText(/Day 4:/).waitFor({ timeout: 3000 })
  await run.getByText(/2 earlier requests cancelled/).waitFor({ timeout: 1000 })
})
// A Learn page that was split answers its old address with a permanent redirect, `.md` twin included.
for (const [from, to] of [
  ['/learn/lists-and-conditions', '/learn/rendering-lists'],
  ['/learn/lists-and-conditions.md', '/learn/rendering-lists.md'],
]) {
  await check(`old ${from} redirects`, '/learn', async (page) => {
    const r = await page.request.get(base + from, { maxRedirects: 0 })
    same(r.status(), 308, 'status')
    same(new URL(r.headers().location, base).pathname, to, 'location')
    same((await page.request.get(base + to)).status(), 200, 'the new page')
  })
}
// Every old /docs address answers a permanent redirect to its new home, `.md` twins included.
for (const [from, to] of [
  ['/docs', '/learn'],
  ['/docs/getting-started', '/learn/installation'],
  ['/docs/rules', '/reference/rules'],
  ['/docs/codes/W001', '/reference/codes/W001'],
  ['/docs/props.md', '/reference/props.md'],
]) {
  await check(`old ${from} redirects`, '/learn', async (page) => {
    const r = await page.request.get(base + from, { maxRedirects: 0 })
    same(r.status(), 308, 'status')
    same(new URL(r.headers().location, base).pathname, to, 'location')
    same((await page.request.get(base + to)).status(), 200, 'the new page')
  })
}
// A demo missing from the build shows its notice in a pane its own size, not a tall empty one.
await check('a missing demo closes its pane around the notice', '/examples', async (page) => {
  const sec = page
    .locator('section[data-site="example"]:has([data-part="run"] > [data-part="missing"])')
    .first()
  if (!(await sec.count())) return // the arena is built: nothing missing
  const { run, notice } = await sec.evaluate((s) => ({
    run: s.querySelector('[data-part="run"]').getBoundingClientRect().height,
    notice: s.querySelector('[data-part="missing"]').getBoundingClientRect().height,
  }))
  if (run > notice + 48)
    throw new Error(`a ${Math.round(run)}px pane around a ${Math.round(notice)}px notice`)
})

// The home page's demos start at the top of their pane, however long the code beside them.
await check('home demos start at the top of their pane', '/', async (page) => {
  const gaps = []
  for (const id of ['shop-1', 'shop-2', 'shop-4', 'shop-5']) {
    const run = page
      .locator('[data-site="story"] [data-site="example"] [data-part="run"]')
      .nth(gaps.length)
    await run.evaluate((r) => r.scrollIntoView({ block: 'start' }))
    await page.waitForTimeout(200)
    gaps.push([
      id,
      await run.evaluate((r) =>
        Math.round(r.firstElementChild.getBoundingClientRect().top - r.getBoundingClientRect().top),
      ),
    ])
  }
  same(
    gaps
      .filter(([, gap]) => gap > 64)
      .map(([id, gap]) => `${id} ${gap}px`)
      .join(),
    '',
    'blank above a demo',
  )
})
// The calendar opens on the working day, not midnight, and the rooms timeline shows its bookings' names.
await check('calendar opens on working hours', '/components/calendar', async (page) => {
  await page.waitForSelector('[data-part="scroller"] > [data-part="cols"]', { state: 'attached' })
  await page.waitForTimeout(800)
  const { top, hour } = await page.evaluate(() => {
    const s = document.querySelector('[data-part="scroller"]:has(> [data-part="cols"])')
    return {
      top: s.scrollTop,
      hour: s.querySelector(':scope > [data-part="cols"]').offsetHeight / 24,
    }
  })
  if (top < hour * 6) throw new Error(`scrolled to ${(top / hour).toFixed(1)}h`)
})
await check('timeline names are not cut', '/components/calendar', async (page) => {
  const sec = page.locator('section#CalendarRooms')
  await sec.scrollIntoViewIfNeeded()
  await page.waitForFunction(
    () =>
      document.querySelector('section#CalendarRooms [data-part="lane"] [data-part="event-title"]'),
    null,
    { timeout: 15000 },
  )
  const cut = await sec.evaluate((s) =>
    [...s.querySelectorAll('[data-part="lane"] [data-part="event"]')]
      .filter((e) => {
        const words = document.createRange()
        words.selectNodeContents(e.querySelector('[data-part="event-title"]'))
        const w = words.getBoundingClientRect(),
          box = e.getBoundingClientRect()
        return w.right > box.right + 1 || w.bottom > box.bottom + 1
      })
      .map((e) => e.querySelector('[data-part="event-title"]').textContent),
  )
  same(cut.join(), '', 'cut names')
})
/** Names in a week or day grid (timed or all-day) that don't read whole: past their event's edge, ellipsized, or broken inside a word. */
const cutNames = (sec) =>
  sec.evaluate((s) =>
    [
      ...s.querySelectorAll(
        '[data-part="col"] > [data-part="event"], [data-part="allday"] > [data-part="chip"]',
      ),
    ]
      .filter((e) => {
        const t = e.querySelector('[data-part="event-title"]') ?? e,
          box = e.getBoundingClientRect(),
          r = document.createRange()
        r.selectNodeContents(t)
        const w = r.getBoundingClientRect()
        if (
          w.right > box.right + 1 ||
          w.bottom > box.bottom + 1 ||
          getComputedStyle(t).textOverflow === 'ellipsis'
        )
          return true
        // a word on two lines has two boxes
        const text = [...t.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim())
        if (!text) return false
        let at = 0
        return text.textContent.split(/(\s+)/).some((word) => {
          const from = at
          at += word.length
          if (!word.trim()) return false
          const wr = document.createRange()
          wr.setStart(text, from)
          wr.setEnd(text, at)
          return wr.getClientRects().length > 1
        })
      })
      .map((e) => (e.querySelector('[data-part="event-title"]') ?? e).textContent),
  )
/** Shows a calendar example in a view (its tab) and waits for it to fit its names. */
const calendarIn = async (page, id, view) => {
  const sec = page.locator(`section#${id}`)
  await sec.scrollIntoViewIfNeeded()
  await sec.locator('[data-part="col"]').first().waitFor()
  if (view) await sec.locator('[role="tab"]', { hasText: view }).click()
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(600)
  return sec
}
// Day and week views read every name whole too, on a desk and a phone ("Incident re…", "Billing walkthrou…" were cut).
for (const viewport of [{ width: 1280, height: 900 }, PHONE]) {
  for (const [id, view] of [
    ['CalendarBusyDay', 'Day'],
    ['CalendarBusyDay', 'Week'],
    ['preview', 'Week'],
  ]) {
    await check(
      `${view.toLowerCase()} names are not cut ${id} at ${viewport.width}`,
      '/components/calendar',
      async (page) => {
        const sec = await calendarIn(page, id, view)
        same((await cutNames(sec)).join(), '', 'cut names')
      },
      viewport,
    )
  }
}
// A desk's week shows all seven days at once, with nothing to scroll sideways (it showed Monday to Thursday).
await check('desktop week shows seven days', '/components/calendar', async (page) => {
  for (const [id, view] of [
    ['preview', 'Week'],
    ['CalendarBusyDay', 'Week'],
  ]) {
    const sec = await calendarIn(page, id, view)
    const m = await sec.evaluate((s) => {
      const sc = s.querySelector('[data-part="scroller"]:has(> [data-part="cols"])'),
        r = sc.getBoundingClientRect()
      const cols = [...sc.querySelectorAll('[data-part="col"]')].map((c) =>
        c.getBoundingClientRect(),
      )
      return {
        days: cols.length,
        inView: cols.filter((c) => c.left >= r.left - 1 && c.right <= r.right + 1).length,
        wide: sc.scrollWidth - sc.clientWidth,
      }
    })
    same(m.days, 7, `${id} days`)
    same(m.inView, 7, `${id} days in view`)
    if (m.wide > 1) throw new Error(`${id} scrolls ${m.wide}px sideways`)
  }
})
// Out of working hours is one quiet shade at both ends of the day: no picture, no loud colour, no unlabelled slab at 18:00.
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
await check(
  'fill wipes by default, follows on request',
  '/components/button?expression=vivid',
  async (page) => {
    const sec = page.locator('section[data-site="tk-section"]:has(h2:text-is("Fill that follows"))')
    await sec.scrollIntoViewIfNeeded()
    await page.waitForTimeout(1500)
    const wipe = sec.locator('[data-scope="button"]:not([data-follow])').first(),
      follow = sec.locator('[data-scope="button"][data-follow]').first()
    const fill = (el) =>
      el.evaluate((e) => {
        const c = getComputedStyle(e, '::before')
        return { t: c.transform, img: c.backgroundImage }
      })
    same((await fill(wipe)).t, 'matrix(0, 0, 0, 1, 0, 0)', 'wipe at rest')
    for (const [el, name] of [
      [wipe, 'wipe'],
      [follow, 'follow'],
    ]) {
      const box = await el.boundingBox()
      await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2)
      await page.waitForTimeout(900)
      const f = await fill(el)
      same(f.t, 'matrix(1, 0, 0, 1, 0, 0)', `${name} covers on hover`)
      if (name === 'follow' && !/radial-gradient/.test(f.img))
        throw new Error('follow draws no spread')
      await page.mouse.move(5, 5)
      await page.waitForTimeout(900)
    }
  },
)

// A code block's scan is played once it arrives, never held part way by where the page rests: at any resting position,
// a block on screen has no tint left over its lines (it was a green slab over the right third of every line near the
// fold). Below the fold it waits, whole, so it does scan as it comes in.
for (const [path, theme] of [
  ['/examples', 'light'],
  ['/components/button', 'dark'],
  ['/', 'light'],
]) {
  await check(
    `code tint is never left part way ${path} ${theme}`,
    path,
    async (page) => {
      await mount(page)
      const tint = () =>
        page.evaluate(() =>
          [...document.querySelectorAll('[data-scope="codeblock"]')].map((c) => {
            const r = c.getBoundingClientRect(),
              s = getComputedStyle(c, '::after').scale
            return { top: r.top, bottom: r.bottom, x: s === 'none' ? 1 : parseFloat(s) }
          }),
        )
      const blocks = (await tint()).length
      if (blocks < 2) throw new Error(`only ${blocks} code blocks`)
      const seen = new Set()
      for (const i of [0, 1, Math.floor(blocks / 2), blocks - 1]) {
        for (const at of [0.55, 0.7, 0.82, 0.93, 0.98]) {
          // rest block i's top at that share of the viewport, by wheel, as a reader would
          const top = await page.evaluate(
            (k) =>
              document.querySelectorAll('[data-scope="codeblock"]')[k].getBoundingClientRect().top,
            i,
          )
          await page.mouse.move(640, 300)
          await page.mouse.wheel(0, top - innerHeightOf(page) * at)
          await page.waitForTimeout(1400)
          for (const [j, t] of (await tint()).entries()) {
            const h = innerHeightOf(page)
            if (t.top < h - 4 && t.bottom > 0 && t.x > 0.001)
              throw new Error(
                `block ${j} resting at ${Math.round(t.top)}px of ${h} keeps a tint ${t.x.toFixed(2)}`,
              )
            if (t.top > h + 2) seen.add(t.x)
          }
        }
      }
      if (seen.size && ![...seen].every((x) => x === 1))
        throw new Error(`a block below the fold is not waiting whole: ${[...seen].join()}`)
    },
    { width: 1280, height: 900 },
    { colorScheme: theme },
  )
}
// …and a block that comes in from below does scan: on screen, part way, a moment after it arrives.
await check('code scans in when it arrives', '/examples', async (page) => {
  await arm(page)
  const n = await page.evaluate(() => {
    const c = [...document.querySelectorAll('[data-scope="codeblock"]')].find(
      (x) => x.getBoundingClientRect().top > innerHeight + 200,
    )
    c.dataset.qa = ''
    return getComputedStyle(c, '::after').scale
  })
  same(parseFloat(n), 1, 'waiting below the fold')
  const top = await page.evaluate(
    () => document.querySelector('[data-qa]').getBoundingClientRect().top,
  )
  await page.mouse.move(640, 300)
  await page.mouse.wheel(0, top - 900 * 0.6)
  await page.waitForTimeout(120)
  const mid = await page.evaluate(() =>
    parseFloat(getComputedStyle(document.querySelector('[data-qa]'), '::after').scale),
  )
  if (!(mid > 0 && mid < 1)) throw new Error(`not scanning a moment after it arrived: ${mid}`)
})

// Every example's code on /examples can be copied, like the kit's, and the copy is that example's code.
await check(
  'examples code has copy buttons',
  '/examples',
  async (page) => {
    const { panes, buttons } = await page.evaluate(() => ({
      panes: document.querySelectorAll('[data-site="example"] [data-scope="codeblock"] pre').length,
      buttons: document.querySelectorAll(
        '[data-site="example"] [data-scope="codeblock"] [data-act="copy"]',
      ).length,
    }))
    if (panes < 10) throw new Error(`only ${panes} code panes`)
    same(buttons, panes, 'copy buttons')
    const pane = page.locator('[data-site="example"] [data-scope="codeblock"]').nth(2)
    await pane.scrollIntoViewIfNeeded()
    await pane.hover()
    await pane.locator('[data-act="copy"]').click()
    await page.waitForFunction(
      () => document.querySelectorAll('[data-act="copy"][data-done]').length === 1,
      null,
      { timeout: 3000 },
    )
    const want = await pane.evaluate((c) =>
      [...c.querySelectorAll('[data-part="line"]')].map((l) => l.textContent).join('\n'),
    )
    same(
      (await page.evaluate(() => navigator.clipboard.readText())) === want,
      true,
      "the copied text is the pane's code",
    )
    // the button sits in the pane's corner and no line runs under it
    const fit = await pane.evaluate((c) => {
      const bx = c.querySelector('[data-act="copy"]').getBoundingClientRect(),
        r = c.getBoundingClientRect()
      return bx.right <= r.right && bx.top >= r.top && bx.right > r.right - 12
    })
    same(fit, true, 'button in the corner')
  },
  { width: 1280, height: 900 },
  { permissions: ['clipboard-read', 'clipboard-write'] },
)

// Component pages flow like the hubs: their headings and notes are in warp.flow, and one left at the top edge fades.
for (const path of [
  '/components/button',
  '/components/table',
  '/blocks/checkout',
  '/charts/line-chart',
]) {
  await check(`component page headings flow ${path}`, path, async (page) => {
    const off = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '[data-site="doc"] :is(section > h2:not([data-part="sr-only"]), section h3, p[data-part="note"])',
        ),
      ]
        .filter((e) => getComputedStyle(e).animationName === 'none')
        .map((e) => e.textContent.slice(0, 30)),
    )
    same(off.join(' | '), '', 'not in the flow')
    const h = page.locator('[data-site="tk-section"] > h2').nth(2)
    const top = await h.evaluate((e) => e.getBoundingClientRect().top)
    await page.mouse.move(640, 300)
    await page.mouse.wheel(0, top + 140)
    await page.waitForTimeout(900)
    const o = await h.evaluate((e) => ({
      top: Math.round(e.getBoundingClientRect().top),
      o: +getComputedStyle(e).opacity,
    }))
    if (o.o > 0.6) throw new Error(`a heading at ${o.top}px is at opacity ${o.o}`)
  })
}

// Everything that fades in as the page scrolls fades out again as it passes under the header: cards, the frames and
// their code, headings, notes, a heading at the top of a tall example. Fields (a form being filled) stay whole. The
// page is walked in 25px steps and each flowed element is watched while its bottom edge crosses the header line: it
// must read below 0.9 there, its own fade times its hosts'. Then by name: no family is entry only (warp-out-none).
const flowSweep = (page) =>
  page.evaluate(async () => {
    const frame = () =>
      new Promise((r) => {
        requestAnimationFrame(() => requestAnimationFrame(r))
      })
    const field = (e) =>
      e.matches('[data-scope="field"], [data-scope="form"] > *, [data-flow="form"]') ||
      !!e.closest('[data-scope="field"]')
    const flows = (e) =>
      e
        .getAnimations()
        .filter(
          (a) =>
            a.timeline?.constructor.name === 'ViewTimeline' &&
            /^warp-(in|out)-/.test(a.animationName ?? '') &&
            !/^warp-in-(scan|value)$/.test(a.animationName),
        )
    const all = [...document.querySelectorAll('main *')].filter(
      (e) =>
        flows(e).some((a) => a.animationName.startsWith('warp-in-')) &&
        !field(e) &&
        e.checkVisibility() &&
        e.getBoundingClientRect().height > 0,
    )
    const entryOnly = all.filter(
      (e) =>
        !flows(e).some(
          (a) => a.animationName.startsWith('warp-out-') && a.animationName !== 'warp-out-none',
        ),
    )
    const line =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--warp-flow-top')) ||
      57
    const seen = new Map()
    const seeing = (e) => {
      let o = 1
      for (let p = e; p; p = p.parentElement) o *= +getComputedStyle(p).opacity
      return o
    }
    const end = document.documentElement.scrollHeight - innerHeight
    for (let y = 0; y <= end; y += 25) {
      scrollTo({ top: y, behavior: 'instant' })
      await frame()
      for (const e of all) {
        const bottom = e.getBoundingClientRect().bottom
        if (bottom <= line && bottom >= line - 30)
          seen.set(e, Math.min(seen.get(e) ?? 1, seeing(e)))
      }
    }
    const name = (e) =>
      `${e.localName}${e.dataset.scope ? `[${e.dataset.scope}]` : ''}${e.dataset.flow ? `{${e.dataset.flow}}` : ''} "${(e.textContent ?? '').trim().slice(0, 24)}"`
    return {
      flowed: all.length,
      watched: seen.size,
      entryOnly: entryOnly.map(name),
      stays: [...seen].filter(([, o]) => o > 0.9).map(([e, o]) => `${name(e)} at ${o.toFixed(2)}`),
    }
  })
for (const path of [
  '/components/select',
  '/components/calendar',
  '/blocks',
  '/blocks/checkout',
  '/charts/line-chart',
  '/examples',
  '/art',
]) {
  await check(`flow: nothing fades in without fading out ${path}`, path, async (page) => {
    await mount(page)
    const r = await flowSweep(page)
    if (r.flowed < 8 || r.watched < 5)
      throw new Error(`only ${r.flowed} flowed and ${r.watched} watched`)
    same(r.entryOnly.slice(0, 6).join(' | '), '', `${r.entryOnly.length} entry only`)
    same(r.stays.slice(0, 6).join(' | '), '', `${r.stays.length} whole at the header`)
  })
}
// Each area's frames and hub cards move their own way, and the icon grid flows inside its window.
await check(
  'flow: components, blocks and charts each move their own way',
  '/components/select',
  async (page) => {
    const pairs = {}
    for (const path of [
      '/components/select',
      '/blocks/checkout',
      '/charts/line-chart',
      '/components',
      '/blocks',
      '/charts',
    ]) {
      await page.goto(base + path, { waitUntil: 'load' })
      await arm(page)
      pairs[path] = await page.evaluate(() =>
        [
          ...new Set(
            [...document.querySelectorAll(':is([data-site="frame"], [data-site="tile"])')].map(
              (e) =>
                e
                  .getAnimations()
                  .map((a) => a.animationName)
                  .filter((n) => /^warp-(in|out)-/.test(n))
                  .join('+'),
            ),
          ),
        ].join(),
      )
    }
    same(pairs['/components/select'], pairs['/components'], 'a component frame and card')
    same(
      new Set([pairs['/components/select'], pairs['/blocks/checkout'], pairs['/charts/line-chart']])
        .size,
      3,
      `three areas: ${JSON.stringify(pairs)}`,
    )
  },
)
await check('flow: the icon grid fades in and out in its window', '/icons', async (page) => {
  await arm(page)
  const win = page.locator('[data-site="icons"] [data-scope="virtual"]')
  await win.scrollIntoViewIfNeeded()
  await page.locator('[data-site="icons"] [data-part="cell"]').first().waitFor()
  await win.evaluate((w) => {
    w.scrollTop = 600
  })
  await page.waitForTimeout(500) // the window mounts the rows it now shows
  // the first row still in the window, scrolled until its bottom edge is 10px under the window's top: it is leaving
  await win.evaluate((w) => {
    const top = w.getBoundingClientRect().top,
      cell = [...w.querySelectorAll('[data-part="cell"]')].find(
        (c) => c.getBoundingClientRect().bottom > top + 10,
      )
    cell.dataset.leaving = ''
    w.scrollTop += cell.getBoundingClientRect().bottom - top - 10
  })
  await page.waitForTimeout(300)
  const r = await win.evaluate((w) => ({
    names: [
      ...new Set(
        [...w.querySelectorAll('[data-part="cell"]')].map((c) =>
          c
            .getAnimations()
            .map((a) => a.animationName)
            .join('+'),
        ),
      ),
    ],
    low: [+getComputedStyle(w.querySelector('[data-leaving]')).opacity],
  }))
  same(r.names.join(), 'warp-in-icon+warp-out-icon', 'cell animations')
  if (!r.low.length || Math.max(...r.low) > 0.9)
    throw new Error(`cells leaving the window's top read ${r.low.join(', ')}`)
})

// The expression dial is server-rendered as the site's default, so a fresh visitor's never flips on hydration; a
// returning visitor's saved stop is checked before paint. Every frame from the first is recorded.
const dialFrames = `window.__dial = []; (function tick() { const v = document.querySelector('[data-dial="expression"] input:checked')?.value; if (v && window.__dial.at(-1) !== v) window.__dial.push(v); if (window.__dial.length < 9 && performance.now() < 6000) requestAnimationFrame(tick) })()`
await check('dial: the server renders what a fresh visitor sees', '/components', async (page) => {
  const html = await (await page.request.get(`${base}/components`)).text()
  const at = html.indexOf('data-dial="expression">')
  const seg = html.slice(at, html.indexOf('</div></div>', at))
  const served = /<input[^>]*value="(\w+)"[^>]*checked|<input[^>]*checked[^>]*value="(\w+)"/.exec(
    seg,
  )
  if (!served) throw new Error('no checked stop in the server HTML')
  await page.waitForTimeout(800)
  const now = await page.evaluate(() => ({
    dial: document.querySelector('[data-dial="expression"] input:checked')?.value,
    root: document.documentElement.dataset.expression,
  }))
  same(served[1] ?? served[2], now.dial, 'server vs hydrated')
  same(now.dial, now.root, 'dial vs page')
})
for (const [who, saved, want] of [
  ['fresh', null, 'vivid'],
  ['returning', 'quiet', 'quiet'],
]) {
  await check(`dial: a ${who} visitor's dial never flips on load`, '/components', async (page) => {
    await page.goto('about:blank')
    await page.context().addInitScript((s) => {
      if (s)
        try {
          localStorage.setItem('warp:dials', JSON.stringify({ expression: s }))
        } catch {}
    }, saved)
    await page.context().addInitScript(dialFrames)
    await page.goto(base + '/components', { waitUntil: 'load' })
    await page.waitForTimeout(1200)
    same(
      (await page.evaluate(() => window.__dial)).join(' → '),
      want,
      'stops shown, frame by frame',
    )
  })
}

// Card's sweep is opt-in, so its page shows a card with the hover line beside one without it, and hovering draws it.
await check('card page shows sweep on and off', '/components/card', async (page) => {
  const sec = page.locator('section#CardSweep')
  await sec.scrollIntoViewIfNeeded()
  const cards = sec.locator('[data-scope="surface"]')
  await cards.first().waitFor()
  same(await cards.count(), 2, 'cards')
  // `sweep` is data-sweep=""; a plain card's "surface" draws only under data-flair="sweep"
  same(
    `${await cards.nth(0).getAttribute('data-sweep')}|${await cards.nth(1).getAttribute('data-sweep')}`,
    '|surface',
    'data-sweep on, then off',
  )
  await cards.nth(0).hover()
  await page.waitForTimeout(900)
  const sr = await cards
    .nth(0)
    .locator(':scope > [data-part="sweep"]')
    .evaluate((n) => getComputedStyle(n).getPropertyValue('--_sr').trim())
  same(sr, '0%', "the hovered card's line drawn all the way")
})
// The month fills each day before "+N more", across a month with something in every week.
await check('month days show what fits, across the month', '/components/calendar', async (page) => {
  const sec = page.locator('section#CalendarMonth')
  await sec.scrollIntoViewIfNeeded()
  await sec.locator('[data-part="day-cell"]').first().waitFor()
  await page.waitForTimeout(400)
  const days = await sec.evaluate((s) =>
    [...s.querySelectorAll('[data-part="day-cell"]')].map((c) => {
      const box = c.getBoundingClientRect(),
        more = c.querySelector('[data-part="more"]')
      const kids = [...c.children].filter((k) => !k.classList.contains('sr')),
        last = kids.at(-1).getBoundingClientRect()
      return {
        date: c.dataset.date,
        n: +(/(\d+) events/.exec(c.querySelector('.sr').textContent)?.[1] ?? 0),
        chips: c.querySelectorAll('[data-part="chip"]').length,
        more: more ? +/\d+/.exec(more.textContent)[0] : 0,
        left: box.bottom - parseFloat(getComputedStyle(c).paddingBlockEnd) - last.bottom,
        over: kids.some((k) => k.getBoundingClientRect().bottom > box.bottom + 0.5),
      }
    }),
  )
  same(
    days
      .filter((d) => d.chips + d.more !== d.n)
      .map((d) => d.date)
      .join(),
    '',
    'days that lose events',
  )
  same(
    days
      .filter((d) => d.more && d.left >= 20)
      .map((d) => `${d.date} (${Math.round(d.left)}px left)`)
      .join(),
    '',
    'room for another chip behind "+N more"',
  )
  same(
    days
      .filter((d) => d.over)
      .map((d) => d.date)
      .join(),
    '',
    'chips cut by their day',
  )
  const weeks = Array.from({ length: days.length / 7 }, (_, w) =>
    days.slice(w * 7, w * 7 + 7).some((d) => d.n),
  )
  same(weeks.filter(Boolean).length, weeks.length, 'weeks with events')
  if (Math.max(...days.filter((d) => d.more).map((d) => d.chips)) < 2)
    throw new Error('a full day shows one chip and "+N more"')
})
// Every month chip reads whole on a desk, and an event reads the same on every day: "Sam on …" on a weekday and "Sam on
// call" over two lines on the weekend was the same event.
await check(
  'month chips read whole and alike on every day',
  '/components/calendar',
  async (page) => {
    const sec = page.locator('section#CalendarMonth')
    await sec.scrollIntoViewIfNeeded()
    await sec.locator('[data-part="day-cell"] [data-part="chip"]').first().waitFor()
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(400)
    const chips = await sec.evaluate((s) =>
      [...s.querySelectorAll('[data-part="day-cell"] [data-part="chip"]')].map((c) => ({
        day: c.closest('[data-part="day-cell"]').dataset.date,
        text: c.textContent,
        cut: c.scrollWidth > c.clientWidth + 1 || c.scrollHeight > c.clientHeight + 1,
        h: Math.round(c.getBoundingClientRect().height),
      })),
    )
    if (chips.length < 40) throw new Error(`only ${chips.length} chips`)
    same(
      chips
        .filter((c) => c.cut)
        .map((c) => `${c.day} ${c.text}`)
        .join(', '),
      '',
      'cut names',
    )
    const heights = {}
    for (const c of chips) (heights[c.text] ??= new Set()).add(c.h)
    same(
      Object.entries(heights)
        .filter(([, h]) => h.size > 1)
        .map(([t, h]) => `${t} ${[...h].join('/')}px`)
        .join(', '),
      '',
      'one name, different heights',
    )
  },
)
// The now line runs under events: where they cover its minute it is not drawn at all, so it never peeks out beside them.
// It is drawn, though: on the day marked as today, in that day's free lanes, in the week and in the day the example opens
// on (the week once marked Monday as today while its line was on Wednesday, inside two meetings, so it showed nowhere).
for (const [id, view] of [
  ['preview', 'Week'],
  ['CalendarBusyDay', 'Week'],
  ['CalendarBusyDay', 'Day'],
]) {
  await check(
    `now line on today, beside the events ${id} ${view}`,
    '/components/calendar',
    async (page) => {
      const sec = await calendarIn(page, id, view)
      const m = await sec.evaluate((s) => ({
        today: s.querySelector('[data-part="col"][aria-current="date"]')?.dataset.date ?? null,
        label: !!s.querySelector('[data-part="now-label"]'),
        lines: [...s.querySelectorAll('[data-part="col"]')].flatMap((col) =>
          [...col.querySelectorAll(':scope > [data-part="now"]')].map((now) => {
            const r = now.getBoundingClientRect()
            const hit = [...col.querySelectorAll('[data-part="event"]')]
              .filter((e) => {
                const bx = e.getBoundingClientRect()
                return (
                  bx.top <= r.top &&
                  bx.bottom >= r.top &&
                  bx.left < r.right - 1 &&
                  bx.right > r.left + 1
                )
              })
              .map((e) => e.textContent.slice(0, 20))
            return {
              day: col.dataset.date,
              w: Math.round(r.width),
              hit: hit.join(),
              dot: getComputedStyle(now, '::before').content,
              edge: Math.abs(r.left - col.getBoundingClientRect().left - col.clientLeft) < 1,
            }
          }),
        ),
      }))
      if (!m.today) throw new Error('no day is marked as today')
      same(m.label, true, 'the gutter says the time')
      if (!m.lines.length) throw new Error(`no now line on ${m.today}`)
      same(
        m.lines
          .filter((n) => n.day !== m.today)
          .map((n) => n.day)
          .join(),
        '',
        'now line on a day that is not today',
      )
      same(
        m.lines
          .filter((n) => n.hit || n.w <= 12 || (!n.edge && n.dot !== 'none'))
          .map((n) => `${n.day} ${n.w}px ${n.hit}`)
          .join(),
        '',
        'now line fragments',
      )
    },
  )
}

// The playground is one object near the top of the page: the component large on a stage, the controls beside it on a
// desk and under it on a phone, the live code under both. Nothing in it runs past the page's edge.
for (const viewport of [{ width: 1280, height: 900 }, PHONE]) {
  for (const path of ['/components/button', '/components/table']) {
    await check(
      `playground is one unit at ${viewport.width} ${path}`,
      path,
      async (page) => {
        await page.locator('#playground').scrollIntoViewIfNeeded()
        await page.waitForSelector('#playground [data-part="mount"][data-ready]', { timeout: 8000 })
        await page.waitForTimeout(300)
        const r = await page.evaluate(() => {
          const box = (s) => {
            const e = document.querySelector(`#playground [data-play] ${s}`)
            if (!e) return null
            const bx = e.getBoundingClientRect()
            return { l: bx.left, r: bx.right, t: bx.top, b: bx.bottom, w: bx.width }
          }
          const ids = [...document.querySelectorAll('[data-site="doc"] > section[id]')].map(
            (x) => x.id,
          )
          return {
            stage: box('[data-part="pair"] > [data-part="stage"]'),
            knobs: box('[data-part="knobs"]'),
            code: box('> [data-part="code"] pre'),
            frame: box(''),
            copy: !!document.querySelector(
              '#playground [data-play] > [data-part="code"] [data-act="copy"]',
            ),
            reset: !!document.querySelector('#playground [data-part="knobs-head"] button'),
            title: document.querySelector('#playground > h2')?.textContent,
            at: ids.indexOf('playground'),
            usage: ids.indexOf('usage'),
            firstVariant: ids.findIndex(
              (i) => !['preview', 'installation', 'playground', 'usage'].includes(i),
            ),
            over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            vw: document.documentElement.clientWidth,
          }
        })
        for (const k of ['stage', 'knobs', 'code'])
          if (!r[k] || r[k].w < 40) throw new Error(`no ${k}`)
        same(r.title, 'Try it', 'title')
        same(r.copy && r.reset, true, 'copy and reset')
        if (!(r.at > -1 && r.at < r.usage && r.at < r.firstVariant))
          throw new Error(
            `playground is section ${r.at}, usage ${r.usage}, first variant ${r.firstVariant}`,
          )
        same(r.over, 0, 'page overflow')
        if (r.frame.r > r.vw + 0.5 || r.frame.l < -0.5)
          throw new Error(`frame runs ${r.frame.l}..${r.frame.r} in ${r.vw}`)
        const wide = path === '/components/table' // a fill stage keeps the full width and puts the controls under it
        if (viewport.width === 1280 && !wide) {
          if (!(r.knobs.l >= r.stage.r - 1 && Math.abs(r.knobs.t - r.stage.t) < 2))
            throw new Error(
              `controls not beside the stage: stage ${JSON.stringify(r.stage)} controls ${JSON.stringify(r.knobs)}`,
            )
          if (r.stage.w < r.knobs.w)
            throw new Error(
              `stage ${r.stage.w}px is not the large part beside ${r.knobs.w}px of controls`,
            )
        } else if (r.knobs.t < r.stage.b - 1)
          throw new Error(
            `controls not under the stage: stage bottom ${r.stage.b}, controls top ${r.knobs.t}`,
          )
        if (r.code.t < Math.max(r.stage.b, r.knobs.b) - 1)
          throw new Error('the code is not under the stage and controls')
      },
      viewport,
    )
  }
}

// A knob changes the component on the stage and the code with it, and Reset takes both back.
await check('a knob changes the preview and the code', '/components/button', async (page) => {
  await page.locator('#playground').scrollIntoViewIfNeeded()
  await page.waitForSelector('#playground [data-part="mount"][data-ready] [data-scope="button"]', {
    timeout: 8000,
  })
  const shown = () =>
    page.evaluate(() => {
      const bx = document.querySelector('#playground [data-part="mount"] [data-scope="button"]')
      return bx && { size: bx.dataset.size ?? 'md', tone: bx.dataset.tone ?? 'accent' }
    }) // a default is left off the element
  same((await shown()).size, 'md', 'start size')
  await page
    .locator(
      '#playground [data-part="knob"]:has([data-part="knob-label"]:text-is("Size")) label:has(input[value="lg"])',
    )
    .click()
  await printed(page, 'size="lg"')
  await page.waitForFunction(
    () =>
      document.querySelector('#playground [data-part="mount"] [data-scope="button"]')?.dataset
        .size === 'lg',
    null,
    { timeout: 4000 },
  )
  await page
    .locator(
      '#playground [data-part="knob"]:has([data-part="knob-label"]:text-is("Tone")) label:has(input[value="critical"])',
    )
    .click()
  await printed(page, 'tone="critical"')
  await page.waitForFunction(
    () =>
      document.querySelector('#playground [data-part="mount"] [data-scope="button"]')?.dataset
        .tone === 'critical',
    null,
    { timeout: 4000 },
  )
  same(new URL(page.url()).searchParams.get('tone'), 'critical', 'the address keeps it')
  await page.locator('#playground [data-part="knobs-head"] button').click()
  await printed(page, '<Button>Deploy</Button>')
  same(JSON.stringify(await shown()), JSON.stringify({ size: 'md', tone: 'accent' }), 'after reset')
})

// The playground's stage takes the page's themes and expressions, and its own.
await check(
  'the playground stage switches theme and expression',
  '/components/button',
  async (page) => {
    await page.locator('#playground').scrollIntoViewIfNeeded()
    await page.waitForSelector('#playground [data-part="mount"][data-ready]', { timeout: 8000 })
    const stage = page.locator('#playground [data-part="pair"] > [data-part="stage"]')
    await page.locator('#playground [data-act="stage-theme"]').click()
    same(await stage.getAttribute('data-theme'), 'light', 'theme')
    await page.locator('#playground [data-act="stage-theme"]').click()
    same(await stage.getAttribute('data-theme'), 'dark', 'theme')
    const seen = new Set()
    for (let i = 0; i < 3; i++) {
      await page.locator('#playground [data-act="stage-expression"]').click()
      seen.add(await stage.getAttribute('data-expression'))
    }
    same([...seen].sort((x, y) => x.localeCompare(y)).join(), 'balanced,quiet,vivid', 'expressions')
    same(
      await page.locator('#playground [data-part="mount"] [data-scope="button"]').count(),
      1,
      'the button is still there',
    )
  },
)

// Every page with a playground draws it: the component on the stage, the code printed, no error on the way.
await check('every playground renders', '/components', async (page) => {
  const { readFileSync } = await import('node:fs')
  const pages = JSON.parse(
    readFileSync(new URL('../src/generated/toolkit.json', import.meta.url), 'utf8'),
  )
  const paths = Object.values(pages)
    .filter((p) => p.playground)
    .map((p) => `/${p.area}/${p.slug}`)
  if (paths.length < 40) throw new Error(`only ${paths.length} playgrounds`)
  const bad = []
  let errors = []
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]))
  for (const path of paths) {
    errors = []
    await page.goto(base + path, { waitUntil: 'load' })
    await page.locator('#playground').scrollIntoViewIfNeeded()
    const ok = await page
      .waitForSelector('#playground [data-part="mount"][data-ready]', { timeout: 8000 })
      .then(
        () => true,
        () => false,
      )
    await page.waitForTimeout(150)
    const r = await page.evaluate(() => ({
      kids: document.querySelector('#playground [data-part="mount"]')?.childElementCount ?? 0,
      code:
        document.querySelector('#playground [data-play] > [data-part="code"] pre')?.innerText ?? '',
      failed: /failed to load/.test(document.querySelector('#playground')?.textContent ?? ''),
      over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }))
    const why = [
      !ok && 'never mounted',
      !r.kids && 'empty stage',
      !/from '@weft-js\/warp'/.test(r.code) && 'no code',
      r.failed && 'failed to load',
      r.over > 0 && `overflows ${r.over}px`,
      ...errors,
    ].filter(Boolean)
    if (why.length) bad.push(`${path} (${why.join(', ')})`)
  }
  same(bad.join('; '), '', 'playgrounds')
})

await b.close()
console.log(`${passed} passed, ${failed.length} failed`)
for (const f of failed) console.log(`  failed: ${f}`)
if (failed.length) process.exit(1)
