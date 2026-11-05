import { flush } from '@weft-js/core/test'
import { readFileSync } from 'node:fs'
import { nowSpans } from '../../src/schedule/Calendar'
import { button, calendar, ev, key, said, tab, TODAY } from './support'

function registerViewsSitBehindAPGTabs() {
  test('views sit behind APG tabs: one stop, arrows switch and move focus', async () => {
    const { container: c } = calendar()
    const week = tab(c, 'Week')
    expect(week.getAttribute('aria-selected')).toBe('true')
    expect(week.tabIndex).toBe(0)
    expect(tab(c, 'Day').tabIndex).toBe(-1)
    week.focus()
    key(week, 'ArrowRight')
    await flush()
    expect(tab(c, 'Day').getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tab(c, 'Day'))
    expect(c.querySelector('[role="tabpanel"]')!.getAttribute('aria-labelledby')).toBe(
      tab(c, 'Day').id,
    )
  })
  test('the week has seven columns, a roving stop and the now line only on today', () => {
    const { container: c } = calendar()
    expect(
      c.querySelectorAll('[data-part="col"]').length ||
        c.querySelectorAll('[data-date][role="gridcell"]').length,
    ).toBe(7)
    expect(c.querySelectorAll('[data-part="now"]').length).toBe(1)
    expect(c.querySelectorAll('[data-part="event"][tabindex="0"]').length).toBe(1)
  })
  test('the now line runs only in the lanes free at that minute, lane edge to lane edge', () => {
    const lanes = new Map([
      ['a', { col: 0, cols: 3, span: 1 }],
      ['b', { col: 1, cols: 3, span: 1 }],
      ['c', { col: 2, cols: 3, span: 1 }],
    ])
    const segs = [
      { id: 'a', s: 600, e: 660 },
      { id: 'b', s: 620, e: 700 },
      { id: 'c', s: 600, e: 630 },
    ]
    expect(nowSpans(null, segs, lanes)).toEqual([])
    expect(nowSpans(500, segs, lanes)).toEqual([{ a: 0, b: 1, inset: '' }]) // nothing over it: the whole column, with its dot
    expect(nowSpans(625, segs, lanes)).toEqual([]) // every lane taken: only the gutter's label says the time
    const third = nowSpans(645, [segs[0]!, segs[1]!], lanes) // the last lane is free: from its edge to the column's
    expect(third).toEqual([
      { a: 2, b: 3, inset: 'inset-inline:calc((100% - 6px) * 2 / 3 + 2px) 0px' },
    ])
    expect(nowSpans(625, [segs[1]!, segs[2]!], lanes)).toEqual([
      { a: 0, b: 1, inset: 'inset-inline:0px calc(100% - (100% - 6px) * 1 / 3)' },
    ])
  })
  test('out of working hours is its own part, one shade before the day and after it', () => {
    const { container: c } = calendar({ defaultView: 'day', workingHours: [540, 1080] })
    const off = [...c.querySelectorAll<HTMLElement>('[data-part="col"] > [data-part="off-hours"]')]
    expect(
      off.map((o) => [o.style.getPropertyValue('--_top'), o.style.getPropertyValue('--_h')]),
    ).toEqual([
      ['0px', 'calc(var(--warp-cal-hour) * 9)'],
      ['calc(var(--warp-cal-hour) * 18)', 'calc(var(--warp-cal-hour) * 6)'],
    ])
    // "band" is a common page part name: a site's own rule for it drew a picture over the evening
    expect(c.querySelector('[data-part="band"]')).toBeNull()
  })
}

function registerWeekAndDayNamesAre() {
  test('week and day names are never ellipsized: they break between words and the grid makes room', () => {
    const css = readFileSync(`${process.cwd()}/../warp-core/styles/app/calendar.css`, 'utf8')
    const title =
      /:where\(\[data-scope="calendar"\] \[data-part="event"\] \[data-part="event-title"\]\) \{([^}]*)\}/.exec(
        css,
      )![1]
    expect(title).toContain('white-space: normal')
    expect(title).not.toContain('ellipsis')
    expect(css).not.toMatch(/\[data-part="band"\]/)
  })
  test('M lifts, arrows step by the snap and a day, Escape puts it back with nothing saved', async () => {
    const { container: c, onMove } = calendar()
    const a = ev(c, 'a')
    a.focus()
    key(a, 'm')
    await flush()
    expect(await said(true)).toMatch(/Moving Design crit/)
    key(ev(c, 'a'), 'ArrowDown')
    key(ev(c, 'a'), 'ArrowRight')
    await flush()
    expect(ev(c, 'a').dataset.state).toBe('moving')
    expect(ev(c, 'a').querySelector('.sr')!.textContent).toMatch(/Tuesday/)
    key(ev(c, 'a'), 'Escape')
    await flush()
    expect(onMove).not.toHaveBeenCalled()
    expect(await said()).toMatch(/Move cancelled/)
    expect(ev(c, 'a').dataset.state).toBeUndefined()
    expect(ev(c, 'a').querySelector('.sr')!.textContent).toMatch(/Monday/)
    expect(document.activeElement).toBe(ev(c, 'a'))
  })
  test('Enter drops: the change is sent once, keeps focus and is announced', async () => {
    const { container: c, onMove } = calendar()
    ev(c, 'a').focus()
    key(ev(c, 'a'), 'm')
    await flush()
    key(ev(c, 'a'), 'ArrowDown')
    await flush()
    key(ev(c, 'a'), 'Enter')
    await flush()
    expect(onMove).toHaveBeenCalledOnce()
    expect(onMove.mock.calls[0]![1]).toMatchObject({
      start: '2026-10-26T10:15',
      end: '2026-10-26T11:15',
    })
    expect(onMove.mock.calls[0]![2]).toBe('keyboard')
    expect(await said()).toMatch(/Moved Design crit to Monday/)
    expect(document.activeElement).toBe(ev(c, 'a'))
  })
}

function registerARejectedMovePutsThe() {
  test('a rejected move puts the event back and says why, assertively', async () => {
    let refuse!: (e: Error) => void
    const { container: c } = calendar({
      onMove: () =>
        new Promise((_, no) => {
          refuse = no
        }),
    })
    ev(c, 'a').focus()
    key(ev(c, 'a'), 'm')
    await flush()
    key(ev(c, 'a'), 'ArrowDown')
    await flush()
    key(ev(c, 'a'), 'Enter')
    await flush()
    expect(ev(c, 'a').querySelector('.sr')!.textContent).toMatch(/10:15/)
    refuse(new Error('Room is taken'))
    await new Promise((r) => {
      setTimeout(r)
    })
    await flush()
    expect(ev(c, 'a').querySelector('.sr')!.textContent).toMatch(/10:00/)
    expect(await said(true)).toMatch(/Couldn't move Design crit: Room is taken/)
  })
  test('a locked event opens but neither lifts nor deletes', async () => {
    const { container: c, onDelete } = calendar({ defaultDate: TODAY })
    const f = ev(c, 'c')
    key(f, 'm')
    key(f, 'Delete')
    await flush()
    expect(f.dataset.state).toBeUndefined()
    expect(onDelete).not.toHaveBeenCalled()
  })
  test('Enter opens the card; Delete on it confirms through an alert dialog', async () => {
    const { container: c, onDelete } = calendar()
    key(ev(c, 'a'), 'Enter')
    await flush()
    expect(ev(c, 'a').getAttribute('aria-expanded')).toBe('true')
    const card = document.querySelector('[data-scope="event-card"]')!
    expect(card.textContent).toContain('Design crit')
    expect(card.textContent).toContain('Studio')
    button('Delete', card).click()
    await flush()
    const dialog = document.querySelector('[role="alertdialog"]')!
    expect(dialog).toBeTruthy()
    expect(onDelete).not.toHaveBeenCalled()
    button('Delete', dialog).click()
    await flush()
    expect(onDelete).toHaveBeenCalledOnce()
    expect(onDelete.mock.calls[0]![0].id).toBe('a')
  })
}

function registerARepeatingEventAsksFor() {
  test('a repeating event asks for the scope before it moves', async () => {
    const { container: c, onMove } = calendar()
    ev(c, 'b').focus()
    key(ev(c, 'b'), 'm')
    await flush()
    key(ev(c, 'b'), 'ArrowDown')
    await flush()
    key(ev(c, 'b'), 'Enter')
    await flush()
    expect(onMove).not.toHaveBeenCalled()
    const dialog = [...document.querySelectorAll('[role="dialog"], dialog')].find((d) =>
      /repeat|recurring|This event/i.test(d.textContent ?? ''),
    )!
    expect(dialog).toBeTruthy()
    button('Move', dialog).click()
    await flush()
    expect(onMove).toHaveBeenCalledOnce()
    expect(onMove.mock.calls[0]![1].scope).toBe('this')
  })
  test('the editor refuses an empty title, focuses it, then saves', async () => {
    const { container: c, onEdit } = calendar()
    key(ev(c, 'a'), 'Enter')
    await flush()
    button('Edit', document.querySelector('[data-scope="event-card"]')!).click()
    await flush()
    const title = [...document.querySelectorAll<HTMLInputElement>('form input')].find(
      (i) => i.value === 'Design crit',
    )!
    title.value = ' '
    title.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    button('Save').click()
    await flush()
    expect(onEdit).not.toHaveBeenCalled()
    expect(document.querySelector('form')!.textContent).toContain('Give it a title.')
    expect(document.activeElement).toBe(title)
    const again = document.querySelector<HTMLInputElement>('form input')!
    again.value = 'Crit'
    again.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    button('Save').click()
    await flush()
    expect(onEdit).toHaveBeenCalledOnce()
    expect(onEdit.mock.calls[0]![0]).toMatchObject({
      id: 'a',
      title: 'Crit',
      start: '2026-10-26T10:00',
      end: '2026-10-26T11:00',
    })
  })
  test('read-only events neither lift nor show a resize handle', async () => {
    const { container: c } = calendar({ readOnly: true })
    key(ev(c, 'a'), 'm')
    await flush()
    expect(ev(c, 'a').dataset.state).toBeUndefined()
    expect(c.querySelector('[data-part="resize"]')).toBeNull()
  })
}

export function registerCalendar() {
  describe('Calendar', () => {
    registerViewsSitBehindAPGTabs()
    registerWeekAndDayNamesAre()
    registerARejectedMovePutsThe()
    registerARepeatingEventAsksFor()
  })
}
