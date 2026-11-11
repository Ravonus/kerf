import { base, check, same, arm, mount, innerHeightOf } from './context.mjs'

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

// Component pages flow like the hubs: their headings and notes are in veneer.flow, and one left at the top edge fades.
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
// must read below 0.9 there, its own fade times its hosts'. Then by name: no family is entry only (veneer-out-none).
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
            /^veneer-(in|out)-/.test(a.animationName ?? '') &&
            !/^veneer-in-(scan|value)$/.test(a.animationName),
        )
    const all = [...document.querySelectorAll('main *')].filter(
      (e) =>
        flows(e).some((a) => a.animationName.startsWith('veneer-in-')) &&
        !field(e) &&
        e.checkVisibility() &&
        e.getBoundingClientRect().height > 0,
    )
    const entryOnly = all.filter(
      (e) =>
        !flows(e).some(
          (a) => a.animationName.startsWith('veneer-out-') && a.animationName !== 'veneer-out-none',
        ),
    )
    const line =
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--veneer-flow-top'),
      ) || 57
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
                  .filter((n) => /^veneer-(in|out)-/.test(n))
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
