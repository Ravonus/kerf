import { untrack } from '@kerf-js/core'
import type { Ctx } from './calendar-state'
import { DAY_FIT } from './shared'

// Every name reads whole (calendar.css breaks it only between words). A day needs room for its longest word in each lane
// it shares (a short event's whole name, on its one line). When every day's need fits the box, the week shows all its
// days and spreads them over the room; when it can't (a phone), each day keeps --veneer-cal-day-min too and the week
// scrolls sideways. Then the hours lengthen until no name runs past the bottom of its event.
export function fitTimeGrid(
  c: Ctx,
  scroller: HTMLDivElement | undefined,
  cols: HTMLDivElement | undefined,
  widths: { value: number[] },
) {
  const s = scroller,
    box = cols
  if (!s || !box || untrack(() => c.drag.value || c.moving.value)) return
  const scrolled = s.scrollTop / Math.max(1, box.offsetHeight)
  for (const v of ['--_tracks', '--_week-w', '--veneer-cal-hour']) s.style.removeProperty(v)
  const gutter = box.querySelector<HTMLElement>('[data-part="gutter"]')?.offsetWidth ?? 52
  const floor = parseFloat(getComputedStyle(s).getPropertyValue('--veneer-cal-day-min')) || 128
  const need = [...box.querySelectorAll<HTMLElement>(':scope > [data-part="col"]')].map((col) =>
    Math.max(
      DAY_FIT,
      ...[...col.querySelectorAll<HTMLElement>(':scope > [data-part="event"]')].map((ev) => {
        const title = ev.querySelector<HTMLElement>('[data-part="event-title"]')
        if (!title) return 0
        const probe = title.cloneNode(true) as HTMLElement
        probe.style.cssText = `position:absolute;visibility:hidden;inline-size:${ev.hasAttribute('data-short') ? 'max-content' : 'min-content'}`
        ev.append(probe)
        const word = probe.getBoundingClientRect().width
        probe.remove()
        const cs = getComputedStyle(ev)
        const lanes =
          (+ev.style.getPropertyValue('--_cols') || 1) /
          (+ev.style.getPropertyValue('--_span') || 1)
        // an event is (day - 6px) / lanes - 2px wide (calendar.css)
        return Math.ceil(
          (word + parseFloat(cs.paddingInlineStart) + parseFloat(cs.paddingInlineEnd) + 2) * lanes +
            6 +
            0.5,
        )
      }),
    ),
  )
  // an all-day event's longest word, shared by the days it spans
  for (const chip of s.querySelectorAll<HTMLElement>('[data-part="allday"] > [data-part="chip"]')) {
    const [, col, span] = /(\d+)\s*\/\s*span\s+(\d+)/.exec(chip.style.gridColumn) ?? []
    if (!col || !span) continue
    const probe = chip.cloneNode(true) as HTMLElement
    probe.style.cssText = 'position:absolute;visibility:hidden;inline-size:min-content'
    chip.parentElement!.append(probe)
    const each = Math.ceil(probe.getBoundingClientRect().width / +span)
    probe.remove()
    for (let i = +col - 2; i < +col - 2 + +span && i < need.length; i++)
      need[i] = Math.max(need[i] ?? 0, each)
  }
  const room = s.clientWidth - gutter
  const fits = need.reduce((a, b) => a + b, 0) <= room
  const f = untrack(() => widths.value)
  const least = need.map((n, i) => (fits ? n : Math.max(n, Math.ceil(floor * (f[i] ?? 1)))))
  s.style.setProperty(
    '--_tracks',
    `${gutter}px ${least.map((n) => `minmax(${n}px, 1fr)`).join(' ')}`,
  )
  s.style.setProperty('--_week-w', fits ? '0px' : `${gutter + least.reduce((a, b) => a + b, 0)}px`)
  const doc = s.ownerDocument
  const cut = () =>
    [
      ...box.querySelectorAll<HTMLElement>(
        '[data-part="col"] > [data-part="event"] [data-part="event-title"]',
      ),
    ].some((t) => {
      const r = doc.createRange()
      r.selectNodeContents(t)
      const w = r.getBoundingClientRect(),
        b = t.closest('[data-part="event"]')!.getBoundingClientRect()
      return w.width > 0 && (w.bottom > b.bottom + 0.5 || w.right > b.right + 0.5)
    })
  const base = box.offsetHeight / 24
  for (let hour = base, i = 0; i < 40 && hour < base * 3 && cut(); i++)
    s.style.setProperty('--veneer-cal-hour', `${(hour += 4)}px`)
  s.scrollTop = scrolled * box.offsetHeight
}
