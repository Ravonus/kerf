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
await check('scroll spy reaches the end', '/learn/installation', async page => {
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
// A knob with a few options is a button per option, and every one of them is on screen inside the panel; a long list
// is a dropdown.
for (const viewport of [{ width: 1280, height: 900 }, PHONE]) {
  await check(`few options are buttons at ${viewport.width}`, '/components/button', async page => {
    await page.locator('[data-play]').scrollIntoViewIfNeeded()
    await page.waitForSelector('[data-play] [data-part="knob"] [data-scope="segmented"]')
    await page.waitForTimeout(400)
    const knobs = await page.evaluate(() => [...document.querySelectorAll('[data-play] [data-part="knob"]:not([hidden])')].map(k => {
      const seg = k.querySelector('[data-scope="segmented"]'), panel = k.getBoundingClientRect()
      const out = seg ? [...seg.querySelectorAll('label')].filter(l => { const r = l.getBoundingClientRect(); return r.width < 8 || r.left < panel.left - 1 || r.right > panel.right + 1 }).map(l => l.textContent) : []
      return { label: k.querySelector('[data-part="knob-label"], label')?.textContent?.trim(), seg: !!seg, options: seg?.querySelectorAll('label').length ?? 0, select: !!k.querySelector('[data-scope="select"], select'), out }
    }))
    for (const name of ['Emphasis', 'Tone', 'Size']) {
      const k = knobs.find(x => x.label === name)
      if (!k) throw new Error(`no ${name} knob`)
      same(k.seg && !k.select, true, `${name} is a button per option`)
      same(k.out.join(), '', `${name} options off the panel`)
    }
  }, viewport)
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
// Hub cards: these three previews fit their card (no giant clipped title, no half a table).
await check('hub previews fit their cards', '/blocks', async page => {
  const out = []
  for (const name of ['conversation', 'bell', 'rolesmatrix']) {
    const tile = page.locator(`[data-site="tile"][data-name="${name}"]`)
    await tile.scrollIntoViewIfNeeded()
    await page.waitForFunction(n => document.querySelector(`[data-site="tile"][data-name="${n}"] [data-part="mount"][data-ready]`), name, { timeout: 15000 }).catch(() => { throw new Error(`${name} never mounted`) })
    await page.waitForTimeout(300)
    out.push(await tile.evaluate((t, which) => {
      const stage = t.querySelector('[data-part="stage"]').getBoundingClientRect(), shown = t.querySelector('[data-part="mount"]').firstElementChild.getBoundingClientRect()
      const fits = shown.top >= stage.top - 1 && shown.left >= stage.left - 1 && shown.right <= stage.right + 1 && (which === 'conversation' || shown.bottom <= stage.bottom + 1)
      return fits ? '' : `${which} ${Math.round(shown.width)}x${Math.round(shown.height)} in ${Math.round(stage.width)}x${Math.round(stage.height)}`
    }, name))
  }
  same(out.filter(Boolean).join(), '', 'previews past their card')
})
// Every hub card is a deliberate picture of its example, at a scale its words can be read (0.3 or more, on a phone as
// on a desktop): the whole example shrunk to fit, or, when that would be too small, its top at full scale, marked as a
// crop. Never wider than the card, starting at its top (not mid-content), with nothing inside running past the card's
// edge; a chart is never cropped, so it shows the whole chart, not its legend.
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
        const scale = +(/scale\(([\d.]+)\)/.exec(m.style.transform)?.[1] ?? 0), crop = m.hasAttribute('data-crop')
        const out = []
        if (!scale) out.push('never fitted')
        else if (scale < 0.3) out.push(`drawn at ${scale.toFixed(2)}`)
        if (crop !== r.bottom > st.bottom + 1) out.push(crop ? 'marked cropped but whole' : 'cut off without a crop')
        if (chart && crop) out.push('chart cropped')
        if (r.left < st.left - 1 || r.right > st.right + 1) out.push('wider than the card')
        if (r.top < st.top - 1) out.push('starts above the card')
        // a descendant cut by the card's edge (in it, but running past it), with nothing between them that clips it
        const clips = e => { for (let p = e.parentElement; p && p !== m; p = p.parentElement) if (getComputedStyle(p).overflowX !== 'visible') return true; return false }
        const past = [...m.querySelectorAll('*')].find(e => { const box = e.getBoundingClientRect(); return box.width > 0 && box.left < st.right && box.right > Math.min(r.right, st.right) + 2 && !clips(e) })
        if (past) out.push(`${past.localName}${past.dataset.part ? `[${past.dataset.part}]` : ''} past its edge`)
        return out.length ? [`${t.dataset.name}: ${out.join(', ')}`] : []
      }), path === '/charts')
      same(bad.join('; '), '', 'cards')
    }, viewport)
  }
}
// On a phone a hub is one card to a row: the picture the card's full width above the name and a readable line or two of
// what it is for, every name and description in full view of its card. The picture hugs its example: no taller than
// 240px (a crop past that), and not a short example in a tall blank box, so the page is long only in proportion to what
// is on it. Blank is the stage's height less the span its drawn things (text, leaves, and boxes with a fill or a border)
// cover.
for (const path of ['/components', '/blocks', '/charts']) {
  await check(`hub cards read on a phone ${path}`, path, async page => {
    for (let i = 0; i < 400; i++) {
      const more = await page.evaluate(() => { const m = document.querySelector('[data-site="tile"] [data-part="mount"]:not([data-ready])'); m?.scrollIntoView({ block: 'center' }); return !!m })
      if (!more) break
      await page.waitForTimeout(100)
    }
    await page.waitForTimeout(1200)
    const { cols, bad } = await page.evaluate(() => ({
      cols: getComputedStyle(document.querySelector('[data-tk="tiles"]')).gridTemplateColumns.split(' ').length,
      bad: [...document.querySelectorAll('[data-site="tile"]')].flatMap(t => {
        const card = t.getBoundingClientRect(), stage = t.querySelector('[data-part="stage"]').getBoundingClientRect()
        const name = t.querySelector('[data-part="words"] strong'), line = t.querySelector('[data-part="words"] span')
        const out = []
        if (stage.width < card.width - 2) out.push(`picture ${Math.round(stage.width)} of ${Math.round(card.width)}px wide`)
        if (stage.height > 242) out.push(`picture ${Math.round(stage.height)}px tall`)
        const drawn = e => { if (!e.firstElementChild || /^(svg|img|canvas|input|textarea|select|video)$/.test(e.localName)) return true; const c = getComputedStyle(e); return c.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(c.borderTopWidth) > 0 || parseFloat(c.borderBottomWidth) > 0 }
        let top = Infinity, bottom = -Infinity
        const cover = r => { if (r.width && r.height) { top = Math.min(top, Math.max(r.top, stage.top)); bottom = Math.max(bottom, Math.min(r.bottom, stage.bottom)) } }
        const holder = t.querySelector('[data-part="mount"]')
        for (const e of holder.querySelectorAll('*')) if (!(e.closest('svg') && e.localName !== 'svg') && drawn(e) && getComputedStyle(e).visibility !== 'hidden') cover(e.getBoundingClientRect())
        const texts = document.createTreeWalker(holder, NodeFilter.SHOW_TEXT)
        for (let n; (n = texts.nextNode());) if (n.textContent.trim()) { const r = document.createRange(); r.selectNodeContents(n); cover(r.getBoundingClientRect()) }
        const blank = stage.height - Math.max(0, bottom - top)
        if (blank > 24 && blank > stage.height * 0.4) out.push(`${Math.round(blank)} of ${Math.round(stage.height)}px blank`)
        if (!line || !line.textContent.trim() || line.getBoundingClientRect().height < 10) out.push('no description')
        else if (parseFloat(getComputedStyle(line).fontSize) < 12) out.push(`description at ${getComputedStyle(line).fontSize}`)
        for (const e of [name, line].filter(Boolean)) { const r = e.getBoundingClientRect(); if (r.top < stage.bottom - 1) out.push(`${e.localName} beside the picture`); if (r.right > card.right + 1 || r.bottom > card.bottom + 1) out.push(`${e.localName} past the card`) }
        if (name.scrollWidth > name.clientWidth + 1) out.push('name cut')
        return out.length ? [`${t.dataset.name}: ${out.join(', ')}`] : []
      }),
    }))
    same(cols, 1, 'cards to a row')
    same(bad.join('; '), '', 'cards')
  }, PHONE)
}
// Docs pages flow like the kit's: their paragraphs, lists and tables are in warp.flow (warp's prose families, with no
// attribute from the build), and below the fold they wait. Check the animation, not markup.
for (const path of ['/reference/rules', '/reference/lists', '/learn/passing-props']) {
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
for (const [path, least] of [['/components/month-picker', 5], ['/components/week-picker', 4], ['/components/period-picker', 4], ['/components/date-time-field', 5], ['/components/command-palette', 5], ['/components/radio-group', 5], ['/components/number-field', 6], ['/components/language-select', 5], ['/components/currency-select', 5], ['/components/payment-card-input', 3], ['/charts/sparkline', 3], ['/components/canvas', 11]]) {
  await check(`enough examples ${path}`, path, async page => {
    const n = await page.evaluate(() => document.querySelectorAll('[data-site="frame"]:not([data-play])').length)
    if (n < least) throw new Error(`${n} examples, want at least ${least}`)
    await mount(page)
    const broken = await page.evaluate(() => [...document.querySelectorAll('[data-part="mount"]')].filter(m => /failed to load/.test(m.textContent)).length)
    same(broken, 0, 'examples that failed')
  })
}
// Every Canvas example paints something, on screen: a blank or zero-sized canvas is a broken example.
await check('canvas examples draw', '/components/canvas', async page => {
  await mount(page)
  const blank = []
  for (const frame of await page.locator('[data-site="frame"]:not([data-play]) [data-part="stage"]').all()) {
    await frame.scrollIntoViewIfNeeded()
    await page.waitForTimeout(250)
    blank.push(await frame.evaluate(s => {
      const c = s.querySelector('canvas')
      if (!c || !c.width || !c.height) return `${s.closest('[id]')?.id ?? '?'} has no canvas`
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
      for (let i = 3; i < d.length; i += 4) if (d[i]) return ''
      return `${s.closest('[id]')?.id ?? '?'} is blank`
    }))
  }
  same(blank.filter(Boolean).join(', '), '', 'canvases')
})
// A page with no headings has no contents column, so its words take the room.
for (const path of ['/reference/rules', '/reference/lists', '/reference/async', '/reference/browser']) {
  await check(`no empty contents column ${path}`, path, async page => {
    const { toc, links } = await page.evaluate(() => ({ toc: document.querySelectorAll('[data-site="toc"]').length, links: document.querySelectorAll('[data-site="toc"] a').length }))
    if (toc && !links) throw new Error('an empty contents column')
  }, { width: 1440, height: 900 })
}
// Learn: the landing and every chapter fit a 375 px phone, open with "You will learn", and end with a pager.
for (const path of ['/learn', '/learn/installation', '/learn/passing-props', '/learn/bind', '/learn/entries', '/learn/full-stack', '/learn/effects']) {
  await check(`learn fits 375 px ${path}`, path, async page => {
    await mount(page)
    // Past the viewport, not past clientWidth: a classic scrollbar makes clientWidth narrower than the page can be.
    same(await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth)), 0, 'page overflow')
  }, { width: 375, height: 812 })
  if (path === '/learn') continue
  await check(`learn page parts ${path}`, path, async page => {
    const parts = await page.evaluate(() => ({ box: document.querySelector('[data-site="you-will-learn"] li')?.textContent ?? '', pager: document.querySelectorAll('[data-part="pager"] a').length, nav: !!document.querySelector('[data-site="doc-nav"] a[aria-current]') }))
    if (!parts.box) throw new Error('no "You will learn" box')
    same(parts.pager, 2, 'pager links')
    same(parts.nav, true, 'the rail marks this page')
  })
}
// A challenge's solution stays hidden until asked for.
await check('learn challenges hide their solution', '/learn/passing-props', async page => {
  const sol = page.locator('[data-site="challenge"] details').first()
  same(await sol.evaluate(d => d.open), false, 'open at first')
  await sol.locator('summary').click()
  same(await sol.evaluate(d => d.open), true, 'open after a click')
})
// A Learn demo runs: the stepper writes the parent's box through bind:.
await check('learn bind demo writes the parent', '/learn/bind', async page => {
  await mount(page)
  const run = page.locator('[data-site="example"] [data-part="run"]').first()
  await run.getByRole('button', { name: '+' }).click()
  await page.waitForFunction(() => /Booked for 3 people/.test(document.querySelector('[data-site="example"] [data-part="run"]')?.textContent ?? ''), null, { timeout: 4000 })
})
// Every old /docs address answers a permanent redirect to its new home, `.md` twins included.
for (const [from, to] of [['/docs', '/learn'], ['/docs/getting-started', '/learn/installation'], ['/docs/rules', '/reference/rules'], ['/docs/codes/W001', '/reference/codes/W001'], ['/docs/props.md', '/reference/props.md']]) {
  await check(`old ${from} redirects`, '/learn', async page => {
    const r = await page.request.get(base + from, { maxRedirects: 0 })
    same(r.status(), 308, 'status')
    same(new URL(r.headers().location, base).pathname, to, 'location')
    same((await page.request.get(base + to)).status(), 200, 'the new page')
  })
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
// Key caps hold keys: "+" and "or" are words between them, and a comma never sits inside a cap ("Enter," was one).
await check('key caps hold keys only', '/components/data-grid', async page => {
  const caps = await page.locator('#accessibility [data-part="keys"] kbd').evaluateAll(ks => ks.map(k => k.textContent.trim()))
  if (!caps.length) throw new Error('no key caps')
  same(caps.filter(k => k === '+' || k === 'or' || /.,$/.test(k)).join(' '), '', 'not keys')
})
// "Go to" and its box are one item: at 1280 they sit on the pages' row, and never apart.
await check('pagination keeps Go to with its box', '/components/pagination-bar', async page => {
  const sec = page.locator('section#PaginationBarControlled')
  await sec.scrollIntoViewIfNeeded()
  await sec.locator('[data-part="jump"]').waitFor()
  const m = await sec.evaluate(s => {
    const mid = r => (r.top + r.bottom) / 2
    const l = s.querySelector('label[for$="-go"]').getBoundingClientRect(), i = s.querySelector('[data-part="jump"]').getBoundingClientRect(), o = s.querySelector('[data-scope="pagination"] ol').getBoundingClientRect()
    return { pair: Math.abs(mid(l) - mid(i)) < 4, row: Math.abs(mid(o) - mid(i)) < 4 }
  })
  same(m.pair, true, 'Go to beside its box')
  same(m.row, true, 'on the pages row')
})
// The bubble toolbar takes a real click (no closed tooltip lies over it) and stays on the selection as the page scrolls.
await check('bubble toolbar takes a click and follows the selection', '/components/rich-text-editor', async page => {
  const sec = page.locator('section#RichTextEditorBubble')
  await sec.scrollIntoViewIfNeeded()
  await sec.locator('[contenteditable]').waitFor()
  await page.waitForTimeout(300)
  same(await page.evaluate(() => [...document.querySelectorAll('[popover]')].filter(p => !p.matches(':popover-open') && getComputedStyle(p).display !== 'none').length), 0, 'closed popovers laid out')
  await sec.evaluate(s => {
    const ed = s.querySelector('[contenteditable]'), t = ed.querySelector('p').firstChild, r = document.createRange()
    ed.focus(); r.setStart(t, 0); r.setEnd(t, 6)
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r)
  })
  await page.waitForTimeout(250)
  const gap = () => sec.evaluate(s => { const bar = s.querySelector('[role="toolbar"]').getBoundingClientRect(), r = getSelection().getRangeAt(0).getBoundingClientRect(); return Math.round(r.top - bar.bottom) })
  const before = await gap()
  const bold = sec.locator('[aria-label="Bold"]')
  const r = await bold.boundingBox()
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2)
  await page.waitForTimeout(150)
  same(await bold.getAttribute('aria-pressed'), 'true', 'Bold pressed')
  await page.mouse.wheel(0, 200)
  await page.waitForTimeout(300)
  const after = await gap()
  if (Math.abs(after - before) > 2) throw new Error(`toolbar drifted from the selection: ${before}px then ${after}px`)
})
// Esc in the palette clears the query, then goes up a level, then closes, as its docs say.
await check('palette Esc steps back before it closes', '/components/command-palette', async page => {
  const sec = page.locator('section#CommandPaletteNested')
  await sec.scrollIntoViewIfNeeded()
  await sec.locator('button', { hasText: 'Search commands' }).click()
  const input = page.locator('dialog[open] [role="combobox"]')
  await input.waitFor()
  const open = () => page.evaluate(() => !!document.querySelector('dialog[data-scope="palette"][open]'))
  await input.fill('Dep')
  await page.keyboard.press('Escape')
  same(await input.inputValue(), '', 'query after Esc')
  same(await open(), true, 'open after clearing')
  await input.fill('Move')
  await page.keyboard.press('Enter')
  await input.fill('us')
  await page.keyboard.press('Escape')
  same(await input.inputValue(), '', 'level query after Esc')
  same(await page.locator('dialog[open] [role="option"]').first().textContent().then(t => /us|eu|ap/i.test(t)), true, 'still in the level')
  await page.keyboard.press('Escape')
  same(await open(), true, 'open after going up')
  same(await page.locator('dialog[open] [role="option"]').first().textContent().then(t => /Move storefront/.test(t)), true, 'back at the top')
  await page.keyboard.press('Escape')
  same(await open(), false, 'closed by the last Esc')
})
// A phone week keeps seven readable days and scrolls sideways; the all-day event keeps its name; month chips ellipsize.
await check('calendar week reads on a phone', '/components/calendar', async page => {
  const sec = page.locator('section#preview') // the Editable week
  await sec.scrollIntoViewIfNeeded()
  await sec.locator('[data-part="col"]').first().waitFor()
  await page.waitForTimeout(300)
  const m = await sec.evaluate(s => {
    const cols = [...s.querySelectorAll('[data-part="col"]')].map(c => c.getBoundingClientRect().width)
    const chip = s.querySelector('[data-part="allday"] [data-part="chip"]')
    return { days: cols.length, min: Math.min(...cols), chipFont: chip ? parseFloat(getComputedStyle(chip).fontSize) : 0 }
  })
  same(m.days, 7, 'days')
  if (m.min < 120) throw new Error(`a day is ${Math.round(m.min)}px wide`)
  if (m.chipFont < 10) throw new Error('the all-day event is a bare dot')
}, { width: 390, height: 844 })
await check('month chips ellipsize', '/components/calendar', async page => {
  const sec = page.locator('section#CalendarMonth')
  await sec.scrollIntoViewIfNeeded()
  await sec.locator('[data-part="day-cell"]').first().waitFor()
  await page.waitForTimeout(300)
  const bad = await sec.evaluate(s => [...s.querySelectorAll('[data-part="day-cell"] [data-part="chip"]')].filter(c => c.scrollWidth > c.clientWidth + 1 && getComputedStyle(c).textOverflow !== 'ellipsis').map(c => c.textContent))
  same(bad.join(), '', 'chips cut without an ellipsis')
})
// Vivid buttons work like Keel's: flat at rest, pulled up and left off a hard offset under the hand, set back down by a press.
await check('vivid buttons pull out on hover', '/components/button?expression=vivid', async page => {
  const btn = page.locator('[data-part="mount"] [data-scope="button"]:not([data-emphasis])').first()
  await btn.scrollIntoViewIfNeeded()
  await page.waitForTimeout(1200)
  const look = () => btn.evaluate(e => { const c = getComputedStyle(e); return { t: c.translate, off: c.boxShadow.match(/(-?[\d.]+)px (-?[\d.]+)px 0px 0px/)?.slice(1, 3).join(' ') } })
  same((await look()).off, '0 0', 'offset at rest')
  const box = await btn.boundingBox()
  await page.mouse.move(box.x + 8, box.y + box.height / 2)
  await page.waitForTimeout(700)
  const over = await look()
  same(over.t, '-2px -2px', 'hover moves up and left')
  if (over.off === '0 0') throw new Error('hover shows no offset')
  // the offset is the page's opposite: black on light, white on dark
  const shade = () => btn.evaluate(e => { const g = document.createElement('canvas').getContext('2d'); g.fillStyle = getComputedStyle(e).boxShadow.match(/^(.*?\)) -?[\d.]+px/)[1]; g.fillRect(0, 0, 1, 1); return [...g.getImageData(0, 0, 1, 1).data.slice(0, 3)].join() })
  const dark = await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches || document.documentElement.dataset.theme === 'dark')
  same(await shade(), dark ? '255,255,255' : '0,0,0', 'offset colour')
  await page.mouse.down()
  await page.waitForTimeout(100)
  same((await look()).off, '0 0', 'press sets it down')
  await page.mouse.up()
})

// The fill wipes in from the left by default; only a button with `follow` spreads from the pointer.
await check('fill wipes by default, follows on request', '/components/button?expression=vivid', async page => {
  const sec = page.locator('section[data-site="tk-section"]:has(h2:text-is("Fill that follows"))')
  await sec.scrollIntoViewIfNeeded()
  await page.waitForTimeout(1500)
  const wipe = sec.locator('[data-scope="button"]:not([data-follow])').first(), follow = sec.locator('[data-scope="button"][data-follow]').first()
  const fill = el => el.evaluate(e => { const c = getComputedStyle(e, '::before'); return { t: c.transform, img: c.backgroundImage } })
  same((await fill(wipe)).t, 'matrix(0, 0, 0, 1, 0, 0)', 'wipe at rest')
  for (const [el, name] of [[wipe, 'wipe'], [follow, 'follow']]) {
    const box = await el.boundingBox()
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2)
    await page.waitForTimeout(900)
    const f = await fill(el)
    same(f.t, 'matrix(1, 0, 0, 1, 0, 0)', `${name} covers on hover`)
    if (name === 'follow' && !/radial-gradient/.test(f.img)) throw new Error('follow draws no spread')
    await page.mouse.move(5, 5)
    await page.waitForTimeout(900)
  }
})

await b.close()
console.log(`${passed} passed, ${failed.length} failed`)
for (const f of failed) console.log(`  failed: ${f}`)
if (failed.length) process.exit(1)
