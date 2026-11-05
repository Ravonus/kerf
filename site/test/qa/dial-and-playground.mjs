import { base, check, same, arm, PHONE } from './context.mjs'

import { calendarIn } from './demos-and-calendar.mjs'
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
