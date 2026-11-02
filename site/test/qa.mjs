// What the site's QA pass found, kept found: `node test/qa.mjs [base]` against a running site. Exits 1 on any failure.
// QA_ONLY=<regex> runs only the checks whose names match.
import { createRequire } from 'node:module'

const { chromium } = createRequire(new URL('../../packages/warp/package.json', import.meta.url))('playwright-core')
const base = process.argv[2] ?? 'http://localhost:3300'
const b = await chromium.launch()
const failed = []
let passed = 0
const only = process.env.QA_ONLY ? new RegExp(process.env.QA_ONLY) : undefined
const check = async (name, path, test, viewport = { width: 1280, height: 900 }) => {
  if (only && !only.test(name)) return
  const page = await b.newPage({ viewport })
  try {
    await page.goto(base + path, { waitUntil: 'load' })
    await test(page)
    passed++
  } catch (e) { failed.push(`${name}: ${e.message.split('\n')[0]}`) }
  await page.close()
}
const same = (got, want, what) => { if (String(got) !== String(want)) throw new Error(`${what}: got ${got}, want ${want}`) }
/** Examples mount as they scroll in, so walk the page until none is waiting. */
const mount = async page => {
  for (let i = 0; i < 80; i++) {
    const more = await page.evaluate(() => { const m = document.querySelector('[data-part="mount"]:not([data-ready])'); m?.scrollIntoView(); return !!m })
    if (!more) break
    await page.waitForTimeout(150)
  }
  await page.waitForTimeout(300)
}
const PHONE = { width: 390, height: 844 }
/** The playground wakes when it's seen, and only then reads the URL. */
const printed = async (page, match) => {
  await page.locator('[data-play]').scrollIntoViewIfNeeded()
  await page.waitForFunction(m => new RegExp(m).test(document.querySelector('[data-play] > [data-part="code"] pre')?.innerText ?? ''), match, { timeout: 8000 })
}

// Long names and wide examples on a phone: the page never scrolls sideways, and nothing leaves its stage.
for (const path of ['/blocks/notification-preferences', '/blocks/push-soft-ask', '/components/inline-calendar', '/blocks/prompt', '/blocks/assistant', '/blocks/tool-call']) {
  await check(`fits a phone ${path}`, path, async page => {
    await mount(page)
    const { page: over, stages } = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      stages: [...document.querySelectorAll('[data-part="stage"]')].flatMap(s => {
        const edge = s.getBoundingClientRect().right
        return [...s.querySelectorAll('[data-scope="calendar"] [data-part="months"], [data-scope="tool-call"], textarea')].filter(e => e.getBoundingClientRect().right > edge + 1).map(e => e.dataset.scope ?? e.dataset.part ?? e.localName)
      }),
    }))
    same(over, 0, 'page overflow')
    same(stages.join(), '', 'past the stage edge')
  }, PHONE)
}

await check('the frame code button opens the code', '/blocks/system-page', async page => {
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

await check('site frame rules stay off a component\'s own code part', '/blocks/system-page', async page => {
  await mount(page)
  const tops = await page.evaluate(() => [...document.querySelectorAll('[data-site="frame"] [data-part="stage"] [data-part="code"]')].map(c => getComputedStyle(c).borderBlockStartStyle))
  if (!tops.length) throw new Error('no code part on the stage to check')
  same([...new Set(tops)].join(), 'none', 'border')
})

await check('LiveStatus words reach the code', '/components/live-status?children=Streaming', async page => {
  await printed(page, '>Streaming</LiveStatus>')
})

await check('LiveStatus with no words closes itself', '/components/live-status', async page => {
  const text = await page.locator('[data-play] > [data-part="code"] pre').innerText()
  if (!text.includes('/>') || text.includes('{children}') || text.includes('</LiveStatus>')) throw new Error(`printed ${text}`)
})

await check('a numeric knob stays a number from the URL', '/components/pagination-bar?size=100', page => printed(page, 'size=\\{100\\}'))

await check('a mixed knob keeps numbers from the URL and its presets', '/components/grid?cols=4', async page => {
  await printed(page, 'cols=\\{4\\}')
  await page.getByRole('button', { name: 'Thumbnails' }).click()
  await printed(page, 'cols=\\{6\\}')
})

await check('the cols example shows what it labels', '/components/grid', async page => {
  await mount(page)
  const labelled = await page.evaluate(() => [...document.querySelectorAll('[data-scope="grid"][data-cols]')].filter(g => g.previousElementSibling?.textContent === `cols={${g.dataset.cols}}`).map(g => [g.dataset.cols, getComputedStyle(g).gridTemplateColumns.split(' ').length]))
  if (!labelled.length) throw new Error('no labelled grids found')
  for (const [want, got] of labelled) same(got, want, `cols={${want}}`)
})

// A link that goes nowhere is a dead end in an example. Links that switch a demo's own state call preventDefault and move aria-current.
for (const path of ['/components/grid', '/blocks/audit-log', '/blocks/invoices']) {
  await check(`no missing anchors ${path}`, path, async page => {
    await mount(page)
    const dead = await page.evaluate(() => [...document.querySelectorAll('[data-part="stage"] a[href^="#"]:not([href="#"])')].filter(a => !a.matches('[aria-current], nav a') && !document.getElementById(decodeURIComponent(a.hash.slice(1)))).map(a => a.getAttribute('href')))
    same(dead.join(), '', 'missing anchors')
  })
}

await check('the sample invoice exists', '/blocks/invoices', async page => {
  await mount(page)
  const href = await page.locator('[data-part="stage"] a[aria-label^="PDF for"]').first().getAttribute('href')
  same((await page.request.get(base + href)).status(), 200, href)
})

// The arena runs or says it isn't there. It never shows a frame around a 404.
for (const [path, frames] of [['/', '[data-site="arena"] iframe'], ['/examples', '[data-part="ask"]']]) {
  await check(`arena is honest on ${path}`, path, async page => {
    const lost = []
    page.on('response', r => { if (r.url().includes('/arena/') && r.status() >= 400) lost.push(`${r.status()} ${new URL(r.url()).pathname}`) })
    const scope = path === '/' ? page.locator('[data-site="arena"]') : page.locator('section[data-site="example"]:has(h2:text-is("Ask the app"))')
    await scope.scrollIntoViewIfNeeded()
    await page.waitForTimeout(1500)
    same(lost.join(), '', 'frame requests')
    const shown = await scope.locator('iframe').count(), said = await scope.locator('[data-part="missing"]').count()
    if (!shown === !said) throw new Error(`${shown} frames and ${said} notices (${frames})`)
    for (const a of await scope.locator('a[href^="/arena/"]').all()) same((await page.request.get(base + await a.getAttribute('href'))).status(), 200, 'arena link')
  })
}

// The contents list reaches the last heading at the end of a page, and comes back.
await check('scroll spy reaches the end', '/docs/getting-started', async page => {
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
await check('icon sizes reach the drawings', '/icons', async page => {
  await page.waitForSelector('[data-site="icons"] [data-part="cell"] svg path', { state: 'attached' })
  for (const size of ['16', '24', '32']) {
    await page.locator(`[data-site="icons"] input[value="${size}"]`).click()
    await page.waitForTimeout(300)
    const { drawn, cut, split } = await page.evaluate(() => {
      const cells = [...document.querySelectorAll('[data-site="icons"] [data-part="cell"]')]
      // Each piece of a name between hyphens is its own text node: one that takes two lines broke mid-word.
      const range = document.createRange()
      const broken = n => [...n.childNodes].some(t => { if (t.nodeType !== 3) return false; range.selectNodeContents(t); return new Set([...range.getClientRects()].map(r => Math.round(r.top))).size > 1 })
      return {
        drawn: cells[0].querySelector('svg').getBoundingClientRect().width,
        cut: cells.filter(c => { const n = c.querySelector('[data-part="name"]'); return n.scrollWidth > n.clientWidth + 1 || n.getBoundingClientRect().bottom > c.getBoundingClientRect().bottom + 1 }).map(c => c.ariaLabel),
        split: cells.filter(c => broken(c.querySelector('[data-part="name"]'))).map(c => c.ariaLabel),
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
  await check(`api table stacks on a phone ${path}`, path, async page => {
    await page.locator('#api-reference').scrollIntoViewIfNeeded()
    const over = await page.evaluate(() => [...document.querySelectorAll('[data-site="props"]')].map(p => p.scrollWidth - p.clientWidth).filter(n => n > 0))
    same(over.join(), '', 'sideways overflow')
  }, PHONE)
}
for (const path of ['/components/dither', '/components/select', '/charts/line-chart']) {
  await check(`api words render code ${path}`, path, async page => {
    const { ticks, blank, code } = await page.evaluate(() => {
      const cells = [...document.querySelectorAll('[data-site="props"] tbody td')]
      return { ticks: cells.filter(c => c.textContent.includes('`')).length, blank: cells.filter(c => c.dataset.label === 'Default' && !c.textContent.trim()).length, code: document.querySelectorAll('[data-site="props"] td[data-label="Description"] code').length }
    })
    same(ticks, 0, 'cells with raw backticks')
    same(blank, 0, 'empty Default cells')
    if (!code) throw new Error('no code in any description')
  })
}
// Every prop and event in every API table says what it does. The pages are read as served (the tables are in the
// server's HTML), so one browser page lists the hubs and the rest is fetches. The allowlisted pages are mid-rewrite
// elsewhere; take each off as it lands.
const WORDS_PENDING = new Set(['/components/calendar', '/components/command-palette', '/components/pagination-bar', '/components/data-grid'])
await check('every api row has a description', '/components', async page => {
  const hrefs = new Set()
  for (const hub of ['/components', '/blocks', '/charts']) {
    if (hub !== '/components') await page.goto(base + hub, { waitUntil: 'load' })
    for (const h of await page.locator('a[data-site="tile"][href]').evaluateAll(as => as.map(a => a.getAttribute('href')))) hrefs.add(h.split('#')[0])
  }
  if (hrefs.size < 150) throw new Error(`only ${hrefs.size} pages listed on the hubs`)
  const text = html => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/g, 'x').trim()
  const empty = []
  let rows = 0
  for (const href of [...hrefs].filter(h => !WORDS_PENDING.has(h))) {
    const html = await (await fetch(base + href)).text()
    for (const [, row] of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
      const cell = /<td data-label="Description"[^>]*>([\s\S]*?)<\/td>/.exec(row)
      if (!cell) continue
      rows++
      if (!text(cell[1])) empty.push(`${href} ${text(/<th\b[^>]*>([\s\S]*?)<\/th>/.exec(row)?.[1] ?? '?')}`)
    }
  }
  if (rows < 1500) throw new Error(`only ${rows} api rows found`)
  same(empty.join(', '), '', 'empty descriptions')
})
// The fold's button is solid and sits under the code, folded or open, so no line runs into it.
await check('view code sits under the code on a phone', '/components/select', async page => {
  const frame = page.locator('[data-site="frame"]:has(> [data-part="code"][data-fold])').first()
  await frame.locator('> [data-part="code"]').scrollIntoViewIfNeeded()
  const clear = () => frame.evaluate(f => {
    const code = f.querySelector(':scope > [data-part="code"] [data-scope="codeblock"]').getBoundingClientRect(), button = f.querySelector('[data-act="stage-code"]')
    return { gap: Math.round(button.getBoundingClientRect().top - code.bottom), solid: !/rgba\(.*, 0\)|transparent/.test(getComputedStyle(button).backgroundColor) }
  })
  for (const when of ['folded', 'open']) {
    const { gap, solid } = await clear()
    if (gap < 0) throw new Error(`${when}: the button overlaps the code by ${-gap}px`)
    same(solid, true, `${when}: solid button`)
    if (when === 'folded') await frame.getByRole('button', { name: 'View code' }).click()
  }
}, PHONE)
// Hub cards: these three previews fit their card (no giant clipped title, no half a table), and a phone gets two
// short cards to a row instead of one long column.
await check('hub previews fit their cards', '/blocks', async page => {
  const out = []
  for (const name of ['conversation', 'bell', 'rolesmatrix']) {
    const tile = page.locator(`[data-site="tile"][data-name="${name}"]`)
    await tile.scrollIntoViewIfNeeded()
    await page.waitForFunction(n => document.querySelector(`[data-site="tile"][data-name="${n}"] [data-part="mount"][data-ready]`), name, { timeout: 15000 }).catch(() => { throw new Error(`${name} never mounted`) })
    await page.waitForTimeout(300)
    out.push(await tile.evaluate((t, name) => {
      const stage = t.querySelector('[data-part="stage"]').getBoundingClientRect(), shown = t.querySelector('[data-part="mount"]').firstElementChild.getBoundingClientRect()
      const fits = shown.top >= stage.top - 1 && shown.left >= stage.left - 1 && shown.right <= stage.right + 1 && (name === 'conversation' || shown.bottom <= stage.bottom + 1)
      return fits ? '' : `${name} ${Math.round(shown.width)}x${Math.round(shown.height)} in ${Math.round(stage.width)}x${Math.round(stage.height)}`
    }, name))
  }
  same(out.filter(Boolean).join(), '', 'previews past their card')
})
// Every hub card is a deliberate picture of its example: scaled into the card, never wider than it, starting at its top
// (not mid-content), with nothing inside running past the card's edge; a chart shows the whole chart, not its legend.
for (const path of ['/components', '/blocks', '/charts']) {
  for (const viewport of [{ width: 1280, height: 900 }, PHONE]) {
    await check(`hub cards are whole pictures ${path} at ${viewport.width}`, path, async page => {
      for (let i = 0; i < 400; i++) {
        const more = await page.evaluate(() => { const m = document.querySelector('[data-site="tile"] [data-part="mount"]:not([data-ready])'); m?.scrollIntoView({ block: 'center' }); return !!m })
        if (!more) break
        await page.waitForTimeout(100)
      }
      await page.waitForTimeout(1200)
      const bad = await page.evaluate(chart => [...document.querySelectorAll('[data-site="tile"]')].flatMap(t => {
        const stage = t.querySelector('[data-part="stage"]'), m = t.querySelector('[data-part="mount"]')
        const st = stage.getBoundingClientRect(), r = m.getBoundingClientRect()
        const scale = +(/scale\(([\d.]+)\)/.exec(m.style.transform)?.[1] ?? 0)
        const out = []
        if (!scale) out.push('never fitted')
        else if (scale < 0.25) out.push(`drawn at ${scale.toFixed(2)}`)
        if (r.left < st.left - 1 || r.right > st.right + 1) out.push('wider than the card')
        if (r.top < st.top - 1) out.push('starts above the card')
        if (chart && r.bottom > st.bottom + 1) out.push('chart cut off')
        // a descendant cut by the card's edge (in it, but running past it), with nothing between them that clips it
        const clips = e => { for (let p = e.parentElement; p && p !== m; p = p.parentElement) if (getComputedStyle(p).overflowX !== 'visible') return true; return false }
        const past = [...m.querySelectorAll('*')].find(e => { const b = e.getBoundingClientRect(); return b.width > 0 && b.left < st.right && b.right > Math.min(r.right, st.right) + 2 && !clips(e) })
        if (past) out.push(`${past.localName}${past.dataset.part ? `[${past.dataset.part}]` : ''} past its edge`)
        return out.length ? [`${t.dataset.name}: ${out.join(', ')}`] : []
      }), path === '/charts')
      same(bad.join('; '), '', 'cards')
    }, viewport)
  }
}
for (const path of ['/components', '/blocks']) {
  await check(`hub is compact on a phone ${path}`, path, async page => {
    const { cols, tall } = await page.evaluate(() => ({ cols: getComputedStyle(document.querySelector('[data-tk="tiles"]')).gridTemplateColumns.split(' ').length, tall: document.documentElement.scrollHeight }))
    same(cols, 2, 'cards to a row')
    if (tall > 14000) throw new Error(`${tall}px long`)
  }, PHONE)
}
// Docs pages flow like the kit's: their paragraphs, lists and tables are in warp.flow (warp's prose families, with no
// attribute from the build), and below the fold they wait. Check the animation, not markup.
for (const path of ['/docs/rules', '/docs/lists']) {
  await check(`docs content flows ${path}`, path, async page => {
    const { blocks, moving } = await page.evaluate(() => {
      const els = [...document.querySelectorAll('[data-scope="prose"] > :is(p, ul, ol, dl, blockquote, table)')]
      return { blocks: els.length, moving: els.filter(e => getComputedStyle(e).animationName !== 'none').length }
    })
    if (!blocks) throw new Error('no prose blocks in the flow')
    same(moving, blocks, 'blocks animating')
  })
}
// The overlay cards on the hub show the surface open (warp's `inline`), not only the button that opens it.
await check('hub overlay cards show their surface /components', '/components', async page => {
  await mount(page)
  const cards = await page.evaluate(() => ['modal', 'drawer', 'popover', 'tooltip'].map(name => {
    const el = document.querySelector(`[data-site="tile"][data-name="${name}"] [data-presentation="inline"]`)
    if (!el) return `${name}: no surface`
    const r = el.getBoundingClientRect(), s = getComputedStyle(el), stage = el.closest('[data-part="mount"]').parentElement.getBoundingClientRect()
    const whole = r.left >= stage.left - 1 && r.right <= stage.right + 1 // the card shows all of its width, nothing cut at the side
    return r.width > 20 && r.height > 10 && whole && +s.opacity === 1 && s.position === 'relative' && !el.matches(':modal, :popover-open') ? '' : `${name}: ${Math.round(r.width)}x${Math.round(r.height)} ${s.position} ${s.opacity}${whole ? '' : ' cut'}`
  }).filter(Boolean))
  same(cards.join('; '), '', 'overlay cards')
})
// A long webhook URL wraps after a slash or before a dot, never mid-word (it broke anywhere).
for (const viewport of [undefined, PHONE]) {
  await check(`webhook URLs break at slashes and dots ${viewport ? 'phone' : 'desktop'}`, '/blocks/webhooks', async page => {
    await mount(page)
    const bad = await page.evaluate(() => [...document.querySelectorAll('[data-part="url"]')].flatMap(code => {
      const text = code.textContent, r = document.createRange(), out = []
      let top, at = 0
      const walk = document.createTreeWalker(code, NodeFilter.SHOW_TEXT)
      for (let n = walk.nextNode(); n; n = walk.nextNode()) for (let i = 0; i < n.length; i++, at++) {
        r.setStart(n, i); r.setEnd(n, i + 1)
        const y = Math.round(r.getClientRects()[0]?.top ?? top)
        if (top !== undefined && y > top + 2 && !(/[/&=]/.test(text[at - 1]) || /[.?#]/.test(text[at]))) out.push(`${text.slice(at - 5, at)}|${text.slice(at, at + 5)}`)
        top = y
      }
      return out
    }))
    same(bad.join(', '), '', 'mid-word breaks')
  }, viewport)
}
// Thin pages: these had one or two examples and now show the states, sizes and real uses beside them.
for (const [path, least] of [['/components/month-picker', 5], ['/components/week-picker', 4], ['/components/period-picker', 4], ['/components/date-time-field', 5], ['/components/command-palette', 5], ['/components/radio-group', 5], ['/components/number-field', 6], ['/components/language-select', 5], ['/components/currency-select', 5], ['/components/payment-card-input', 3], ['/charts/sparkline', 3]]) {
  await check(`enough examples ${path}`, path, async page => {
    const n = await page.evaluate(() => document.querySelectorAll('[data-site="frame"]:not([data-play])').length)
    if (n < least) throw new Error(`${n} examples, want at least ${least}`)
    await mount(page)
    const failed = await page.evaluate(() => [...document.querySelectorAll('[data-part="mount"]')].filter(m => /failed to load/.test(m.textContent)).length)
    same(failed, 0, 'examples that failed')
  })
}
// A page with no headings has no contents column, so its words take the room.
for (const path of ['/docs/rules', '/docs/lists', '/docs/async', '/docs/browser']) {
  await check(`no empty contents column ${path}`, path, async page => {
    const { toc, links } = await page.evaluate(() => ({ toc: document.querySelectorAll('[data-site="toc"]').length, links: document.querySelectorAll('[data-site="toc"] a').length }))
    if (toc && !links) throw new Error('an empty contents column')
  }, { width: 1440, height: 900 })
}
// A demo missing from the build shows its notice in a pane its own size, not a tall empty one.
await check('a missing demo closes its pane around the notice', '/examples', async page => {
  const sec = page.locator('section[data-site="example"]:has([data-part="run"] > [data-part="missing"])').first()
  if (!await sec.count()) return // the arena is built: nothing missing
  const { run, notice } = await sec.evaluate(s => ({ run: s.querySelector('[data-part="run"]').getBoundingClientRect().height, notice: s.querySelector('[data-part="missing"]').getBoundingClientRect().height }))
  if (run > notice + 48) throw new Error(`a ${Math.round(run)}px pane around a ${Math.round(notice)}px notice`)
})

// The home page's demos start at the top of their pane, however long the code beside them.
await check('home demos start at the top of their pane', '/', async page => {
  const gaps = []
  for (const id of ['shop-1', 'shop-2', 'shop-4', 'shop-5']) {
    const run = page.locator('[data-site="story"] [data-site="example"] [data-part="run"]').nth(gaps.length)
    await run.scrollIntoViewIfNeeded()
    await page.evaluate(() => scrollBy(0, -300))
    await page.waitForTimeout(200)
    gaps.push([id, await run.evaluate(r => Math.round(r.firstElementChild.getBoundingClientRect().top - r.getBoundingClientRect().top))])
  }
  same(gaps.filter(([, gap]) => gap > 64).map(([id, gap]) => `${id} ${gap}px`).join(), '', 'blank above a demo')
})
// The calendar opens on the working day, not midnight, and the rooms timeline shows its bookings' names.
await check('calendar opens on working hours', '/components/calendar', async page => {
  await page.waitForSelector('[data-part="scroller"] > [data-part="cols"]', { state: 'attached' })
  await page.waitForTimeout(800)
  const { top, hour } = await page.evaluate(() => { const s = document.querySelector('[data-part="scroller"]:has(> [data-part="cols"])'); return { top: s.scrollTop, hour: s.querySelector(':scope > [data-part="cols"]').offsetHeight / 24 } })
  if (top < hour * 6) throw new Error(`scrolled to ${(top / hour).toFixed(1)}h`)
})
await check('timeline names are not cut', '/components/calendar', async page => {
  const sec = page.locator('section#CalendarRooms')
  await sec.scrollIntoViewIfNeeded()
  await page.waitForFunction(() => document.querySelector('section#CalendarRooms [data-part="lane"] [data-part="event-title"]'), null, { timeout: 15000 })
  const cut = await sec.evaluate(s => [...s.querySelectorAll('[data-part="lane"] [data-part="event"]')].filter(e => { const words = document.createRange(); words.selectNodeContents(e.querySelector('[data-part="event-title"]')); const w = words.getBoundingClientRect(), box = e.getBoundingClientRect(); return w.right > box.right + 1 || w.bottom > box.bottom + 1 }).map(e => e.querySelector('[data-part="event-title"]').textContent))
  same(cut.join(), '', 'cut names')
})
// The Ticker playground's starting value is big enough for en-IN's grouping to show.
await check('ticker shows en-IN grouping', '/components/ticker?locale=en-IN', async page => {
  await page.locator('[data-play]').scrollIntoViewIfNeeded()
  await page.waitForFunction(() => /12,48,120/.test(document.querySelector('[data-play] [data-part="stage"]')?.textContent ?? ''), null, { timeout: 8000 }).catch(async () => { throw new Error(`shows ${await page.locator('[data-play] [data-part="stage"]').textContent()}`) })
})
// Related pages are quiet links with their names as words, not loud buttons in squashed capitals.
await check('related links read as words', '/blocks/checkout', async page => {
  const links = await page.locator('[data-site="related"] a').evaluateAll(as => as.map(a => ({ text: a.innerText, button: a.dataset.scope === 'button', upper: getComputedStyle(a).textTransform })))
  if (!links.length) throw new Error('no related links')
  same(links.filter(l => l.button || l.upper === 'uppercase' || /[a-z][A-Z]/.test(l.text)).map(l => l.text).join(), '', 'loud or squashed')
})
await b.close()
console.log(`${passed} passed, ${failed.length} failed`)
for (const f of failed) console.log(`  failed: ${f}`)
if (failed.length) process.exit(1)
