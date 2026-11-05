import { base, check, same, mount, PHONE, printed } from './context.mjs'

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
