import type { Page } from 'playwright-core'
import { timelineNames } from './polish.browser-timeline.mjs'

const calendarIn = (id: string) => `#${id} [data-scope="calendar"][data-part="root"]`

function timelineCases(getPage: () => Page) {
  test("a phone timeline shows every booking's whole name, broken only between words, and scrolls with a shadow", async () => {
    const page = getPage()
    await page.waitForTimeout(100) // the hours settle their width a frame after mount
    const m = await timelineNames(page, calendarIn('tl-phone'))
    expect(m.events.length).toBe(5)
    expect(m.sw).toBeGreaterThan(m.cw) // an hour keeps its width, so the day scrolls sideways
    expect(m.overflow).toBe('end')
    for (const e of m.events) {
      expect(e.w).toBeGreaterThanOrEqual(30) // never the 20px slivers that stacked a letter a line
      expect(e.cut, e.name).toBe(false)
      expect(e.split, e.name).toEqual([])
      if (!e.title) expect(e.start).toBe(true)
    }
    // "Billing walkthrough" and "Incident review: mobile-bff" are an hour or less: they show whole, not "walkth…"
    expect(
      m.events.filter((e: { title: string }) => e.title).map((e: { name: string }) => e.name),
    ).toEqual(expect.arrayContaining(['Billing walkthrough', 'Design crit']))
  })

  test('a desktop timeline shows every name whole, and the now line runs under the bookings', async () => {
    const page = getPage()
    const m = await timelineNames(page, calendarIn('tl-desk'))
    for (const e of m.events) {
      expect(e.cut, e.name).toBe(false)
      expect(e.split, e.name).toEqual([])
    }
    // it only scrolls when an hour had to widen for a word, and then says so with its edge shadow
    expect(m.sw > m.cw + 1 ? m.overflow : '').toBe(m.sw > m.cw + 1 ? 'end' : '')
    const z = await page.evaluate((sel) => {
      const root = document.querySelector<HTMLElement>(sel)!,
        ev = root.querySelector<HTMLElement>('[data-id="c"]')!,
        now = root.querySelector<HTMLElement>('[data-part="lane"] [data-part="now"]')!
      return { evZ: +getComputedStyle(ev).zIndex, nowZ: +getComputedStyle(now).zIndex }
    }, calendarIn('tl-desk'))
    expect(z.nowZ).toBeLessThan(z.evZ)
  })
}

function weekCases(getPage: () => Page) {
  test('a phone week keeps all seven days at a readable width and scrolls sideways, with the hours and day heads in place', async () => {
    const page = getPage()
    const sel = calendarIn('week-phone')
    await page.locator(sel).scrollIntoViewIfNeeded()
    const m = await page.evaluate((at) => {
      const root = document.querySelector<HTMLElement>(at)!,
        sc = root.querySelector<HTMLElement>('[data-view="time"] > [data-part="scroller"]')!
      const cols = [...root.querySelectorAll<HTMLElement>('[data-part="col"]')].map(
        (c) => c.getBoundingClientRect().width,
      )
      const titles = [
        ...root.querySelectorAll('[data-part="col"] [data-part="event"] [data-part="event-title"]'),
      ].map((t) => ({
        name: t.textContent,
        w: t.getBoundingClientRect().width,
        shown: t.getBoundingClientRect().width >= t.scrollWidth - 1,
      }))
      const gutter = root.querySelector<HTMLElement>('[data-part="cols"] > [data-part="gutter"]')!
      const before = gutter.getBoundingClientRect().left
      sc.scrollLeft = 200
      const after = gutter.getBoundingClientRect().left
      const head = root.querySelector<HTMLElement>('[data-part="top"]')!,
        headTop = head.getBoundingClientRect().top
      sc.scrollTop += 300
      const headTop2 = head.getBoundingClientRect().top
      const chip = root.querySelector<HTMLElement>('[data-part="allday"] [data-part="chip"]')!
      return {
        days: cols.length,
        min: Math.min(...cols),
        sw: sc.scrollWidth,
        cw: sc.clientWidth,
        titles,
        shadow: root.querySelector<HTMLElement>('[data-view="time"]')!.dataset.overflow ?? '',
        gutterStays: Math.abs(after - before) < 1,
        headStays: Math.abs(headTop2 - headTop) < 1,
        chip: {
          w: chip.getBoundingClientRect().width,
          font: parseFloat(getComputedStyle(chip).fontSize),
          text: chip.textContent,
        },
      }
    }, sel)
    expect(m.days).toBe(7)
    expect(m.min).toBeGreaterThanOrEqual(120)
    expect(m.sw).toBeGreaterThan(m.cw)
    expect(m.shadow).toContain('end') // the side with more days is shaded
    expect(m.gutterStays).toBe(true)
    expect(m.headStays).toBe(true)
    // an event's name reads: at least a word of it, never "D…"
    for (const t of m.titles)
      expect(t.w, t.name).toBeGreaterThanOrEqual(Math.min(48, t.name.length * 5))
    // the all-day event keeps its name, not a bare dot
    expect(m.chip.font).toBeGreaterThan(10)
    expect(m.chip.w).toBeGreaterThan(60)
  })
}

function dayMonthCases(getPage: () => Page) {
  test("a phone day shows its all-day event by name, and a short event's name before its times", async () => {
    const page = getPage()
    const m = await page.evaluate((sel) => {
      const root = document.querySelector<HTMLElement>(sel)!
      const chip = root.querySelector<HTMLElement>('[data-part="allday"] [data-part="chip"]')!
      const standup = [...root.querySelectorAll('[data-part="event"]')].find((e) =>
        e.textContent.includes('Standup'),
      )
      const t = standup?.querySelector<HTMLElement>('[data-part="event-title"]')
      return {
        chip: chip && {
          w: chip.getBoundingClientRect().width,
          font: parseFloat(getComputedStyle(chip).fontSize),
          text: chip.textContent,
        },
        title: t && { w: t.getBoundingClientRect().width, need: t.scrollWidth },
      }
    }, calendarIn('day-phone'))
    expect(m.chip.text).toBe('Jun on call')
    expect(m.chip.font).toBeGreaterThan(10)
    expect(m.chip.w).toBeGreaterThan(80)
    expect(m.title!.w).toBeGreaterThanOrEqual(m.title!.need - 1) // "Standup" whole; the times give way first
  })

  const monthChips = (sel: string) =>
    getPage().$$eval(`${sel} [data-part="day-cell"] [data-part="chip"]`, (cs) =>
      cs.map((c) => ({
        day: c.closest<HTMLElement>('[data-part="day-cell"]')!.dataset.date,
        text: c.textContent,
        over: c.scrollWidth > c.clientWidth + 1,
        ellipsis: getComputedStyle(c).textOverflow,
        display: getComputedStyle(c).display,
        wrap: c.hasAttribute('data-wrap'),
        clamp: getComputedStyle(c).webkitLineClamp,
        h: Math.round(c.getBoundingClientRect().height),
      })),
    )

  test('a month with full days keeps every name to one line, ending a long one in an ellipsis, on every day alike', async () => {
    const chips = await monthChips('#month')
    expect(chips.filter((c) => c.wrap).map((c) => `${c.day} ${c.text}`)).toEqual([]) // "Quarter close" and "Retro" sit alone, and stay one line like the rest
    expect(new Set(chips.map((c) => c.h))).toEqual(new Set([18]))
    const long = chips.filter((c) => c.over)
    expect(long.map((c) => c.text)).toContain('Release 2026.11 to every region')
    for (const c of long) {
      expect(c.ellipsis, c.text).toBe('ellipsis')
      expect(c.display).toBe('block')
    }
  })

  test('a month whose every day has room lets long names take a second line on every day, weekend or not', async () => {
    const chips = await monthChips('#month-roomy')
    expect(chips.length).toBeGreaterThan(0)
    for (const c of chips) {
      expect(c.wrap, c.text).toBe(true)
      expect(c.clamp, c.text).toBe('2')
      expect(c.h, c.text).toBeLessThanOrEqual(34.5)
    }
    const release = chips.filter((c) => c.text === 'Release 2026.11 to every region') // Saturday, Sunday and Monday
    expect(release.length).toBe(3)
    expect(new Set(release.map((c) => c.h)).size).toBe(1)
    expect(release[0]!.h).toBeGreaterThan(18)
    expect(chips.find((c) => c.text === 'Retro')!.h).toBe(18) // a short name stays one line
  })
}

function monthMoreCases(getPage: () => Page) {
  test('a month day fills its room before it says "+N more", and shows everything when it can', async () => {
    const page = getPage()
    const days = await page.$$eval('#month [data-part="day-cell"]', (cells) =>
      cells.map((c) => {
        const box = c.getBoundingClientRect(),
          more = c.querySelector<HTMLElement>('[data-part="more"]')!,
          chips = c.querySelectorAll('[data-part="chip"]').length
        const n = +(/(\d+) events/.exec(c.querySelector<HTMLElement>('.sr')!.textContent)?.[1] ?? 0)
        const last = [...c.children]
          .filter((k) => !k.classList.contains('sr'))
          .at(-1)!
          .getBoundingClientRect()
        return {
          date: c.dataset.date,
          n,
          chips,
          more: more ? +/\d+/.exec(more.textContent)![0] : 0,
          left: box.bottom - parseFloat(getComputedStyle(c).paddingBlockEnd) - last.bottom,
        }
      }),
    )
    for (const d of days) {
      expect(d.chips + d.more, d.date).toBe(d.n)
      if (d.more)
        expect(d.left, `${d.date}: room for another chip behind +${d.more} more`).toBeLessThan(20)
    }
    expect(days.filter((d) => d.more).length).toBeGreaterThan(0)
  })

  test('the now line never peeks out beside the events over it: no tick at the edge, no dash past the last lane', async () => {
    const page = getPage()
    const m = await page.evaluate((sel) => {
      const root = document.querySelector<HTMLElement>(sel)!
      return [...root.querySelectorAll<HTMLElement>('[data-part="col"]')].flatMap((col) =>
        [...col.querySelectorAll(':scope > [data-part="now"]')].map((now) => {
          const r = now.getBoundingClientRect(),
            dot = getComputedStyle(now, '::before').content
          const hit = [...col.querySelectorAll<HTMLElement>('[data-part="event"]')]
            .filter((e) => {
              const b = e.getBoundingClientRect()
              return (
                b.top <= r.top && b.bottom >= r.top && b.left < r.right - 1 && b.right > r.left + 1
              )
            })
            .map((e) => e.dataset.id)
          return {
            day: col.dataset.date,
            w: r.width,
            hit,
            dot,
            edge: Math.abs(r.left - col.getBoundingClientRect().left) < 1,
          }
        }),
      )
    }, calendarIn('week-free'))
    for (const n of m) {
      expect(n.hit, n.day).toEqual([])
      expect(n.w, n.day).toBeGreaterThan(12)
      if (!n.edge) expect(n.dot, n.day).toBe('none')
    }
    // 10:40 on Wednesday the 4th is inside "Incident review: mobile-bff", the whole column at that minute
    expect(m.filter((n) => n.day === '2026-11-04')).toEqual([])
  })
}

function monthFitCases(getPage: () => Page) {
  test('the month shows all its weeks in the height it has, with "+N more" for days that hold more', async () => {
    const page = getPage()
    const m = await page.evaluate((sel) => {
      const root = document.querySelector<HTMLElement>(sel)!,
        sc = root.querySelector<HTMLElement>('[data-part="main"] [data-part="scroller"]')!
      const cells = [...root.querySelectorAll('[data-part="day-cell"]')]
      const last = cells[cells.length - 1]!.getBoundingClientRect(),
        box = sc.getBoundingClientRect()
      const clipped = cells.filter((c) =>
        [...c.children].some(
          (k) => k.getBoundingClientRect().bottom > c.getBoundingClientRect().bottom + 0.5,
        ),
      ).length
      return {
        weeks: cells.length / 7,
        sh: sc.scrollHeight,
        ch: sc.clientHeight,
        lastIn: last.bottom <= box.bottom + 1,
        clipped,
        more: root.querySelectorAll('[data-part="more"]').length,
      }
    }, '#month [data-scope="calendar"][data-part="root"]')
    expect(m.weeks).toBeGreaterThanOrEqual(5)
    expect(m.sh).toBeLessThanOrEqual(m.ch + 1)
    expect(m.lastIn).toBe(true) // the 23rd-30th week is on screen, not below a fold with no cue
    expect(m.clipped).toBe(0) // no chip or "+N more" is cut by its day
    expect(m.more).toBeGreaterThan(0)
  })

  test('a calendar no parent gives a height bounds itself, and opens the week at its working hours', async () => {
    const page = getPage()
    const m = await page.evaluate((sel) => {
      const root = document.querySelector<HTMLElement>(sel)!,
        sc = root.querySelector<HTMLElement>('[data-part="scroller"]')!,
        cols = root.querySelector<HTMLElement>('[data-part="cols"]')!
      return {
        h: root.getBoundingClientRect().height,
        vh: innerHeight,
        top: sc.scrollTop,
        hour: cols.offsetHeight / 24,
        scrolls: sc.scrollHeight > sc.clientHeight,
      }
    }, calendarIn('week-free'))
    expect(m.h).toBeLessThanOrEqual(m.vh + 1)
    expect(m.scrolls).toBe(true)
    expect(m.top / m.hour).toBeGreaterThan(8) // workingHours [540, 1080]: 09:00, half an hour before
    expect(m.top / m.hour).toBeLessThan(9)
  })
}

export function registerCalendarCases(getPage: () => Page) {
  timelineCases(getPage)
  weekCases(getPage)
  dayMonthCases(getPage)
  monthMoreCases(getPage)
  monthFitCases(getPage)
}
