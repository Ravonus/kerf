// The schedule pack driven as a user would: views, keyboard move, the card, dialogs, rollback, and the fields paths (07 §2, §6.4).
import { state } from '@weft-js/core'
import { flush, render } from '@weft-js/core/test'
import type { CalEvent } from '@weft-js/warp-core'
import { Agenda } from '../src/schedule/Agenda'
import { AvailabilityEditor } from '../src/schedule/AvailabilityEditor'
import { BookingCalendar } from '../src/schedule/BookingCalendar'
import { Calendar } from '../src/schedule/Calendar'
import { MeetingPlanner } from '../src/schedule/MeetingPlanner'
import { MoveSheet } from '../src/schedule/MoveSheet'
import { YearView } from '../src/schedule/YearView'

beforeAll(() => { document.head.append(Object.assign(document.createElement('style'), { textContent: 'dialog { display: block !important }' })) })
// what Toaster mounts: without it `announce` has nowhere to speak
beforeEach(() => { document.body.replaceChildren(...['polite', 'assertive'].map(live => { const n = document.createElement('div'); n.dataset.scope = 'announcer'; n.setAttribute('aria-live', live); return n })) })
afterEach(() => { document.body.replaceChildren() })

const TODAY = '2026-10-28'
const EVENTS: CalEvent[] = [
  { id: 'a', title: 'Design crit', start: '2026-10-26T10:00', end: '2026-10-26T11:00', cal: 2, location: 'Studio' },
  { id: 'b', title: 'Standup', start: '2026-10-27T09:00', end: '2026-10-27T09:30', cal: 1, recurrence: 'FREQ=WEEKLY' },
  { id: 'c', title: 'Focus', start: '2026-10-28T14:00', end: '2026-10-28T15:00', cal: 3, locked: true },
]
const key = (el: Element, k: string, init: KeyboardEventInit = {}) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }))
const button = (name: string | RegExp, root: ParentNode = document) => [...root.querySelectorAll<HTMLElement>('button')].find(b => (typeof name === 'string' ? (b.getAttribute('aria-label') ?? b.textContent ?? '').trim() === name : name.test(b.textContent ?? '')))!
const tab = (c: Element, name: string) => [...c.querySelectorAll<HTMLElement>('[role="tab"]')].find(t => t.textContent === name)!
const ev = (c: Element, id: string) => c.querySelector<HTMLElement>(`[data-id="${id}"]`)!
const said = async (assertive = false) => { await new Promise(r => setTimeout(r, 70)); return document.querySelector(`[data-scope="announcer"][aria-live="${assertive ? 'assertive' : 'polite'}"]`)!.textContent }

function calendar(over: Partial<Parameters<typeof Calendar>[0]> = {}) {
  const onMove = vi.fn(), onResize = vi.fn(), onDelete = vi.fn(), onEdit = vi.fn(), onCreate = vi.fn()
  const r = render(() => <Calendar events={EVENTS} defaultView="week" defaultDate={TODAY} today={TODAY} now="2026-10-28T10:40" locale="en-US" firstDayOfWeek={1} onMove={onMove} onResize={onResize} onDelete={onDelete} onEdit={onEdit} onCreate={onCreate} {...over} />)
  return { ...r, onMove, onResize, onDelete, onEdit, onCreate }
}

describe('Calendar', () => {
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
    expect(c.querySelector('[role="tabpanel"]')!.getAttribute('aria-labelledby')).toBe(tab(c, 'Day').id)
  })

  test('the week has seven columns, a roving stop and the now line only on today', () => {
    const { container: c } = calendar()
    expect(c.querySelectorAll('[data-part="col"]').length || c.querySelectorAll('[data-date][role="gridcell"]').length).toBe(7)
    expect(c.querySelectorAll('[data-part="now"]').length).toBe(1)
    expect(c.querySelectorAll('[data-part="event"][tabindex="0"]').length).toBe(1)
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
    expect(onMove.mock.calls[0][1]).toMatchObject({ start: '2026-10-26T10:15', end: '2026-10-26T11:15' })
    expect(onMove.mock.calls[0][2]).toBe('keyboard')
    expect(await said()).toMatch(/Moved Design crit to Monday/)
    expect(document.activeElement).toBe(ev(c, 'a'))
  })

  test('a rejected move puts the event back and says why, assertively', async () => {
    let refuse!: (e: Error) => void
    const { container: c } = calendar({ onMove: () => new Promise((_, no) => (refuse = no)) })
    ev(c, 'a').focus()
    key(ev(c, 'a'), 'm')
    await flush()
    key(ev(c, 'a'), 'ArrowDown')
    await flush()
    key(ev(c, 'a'), 'Enter')
    await flush()
    expect(ev(c, 'a').querySelector('.sr')!.textContent).toMatch(/10:15/)
    refuse(new Error('Room is taken'))
    await new Promise(r => setTimeout(r))
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
    expect(onDelete.mock.calls[0][0].id).toBe('a')
  })

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
    const dialog = [...document.querySelectorAll('[role="dialog"], dialog')].find(d => /repeat|recurring|This event/i.test(d.textContent ?? ''))!
    expect(dialog).toBeTruthy()
    button('Move', dialog).click()
    await flush()
    expect(onMove).toHaveBeenCalledOnce()
    expect(onMove.mock.calls[0][1].scope).toBe('this')
  })

  test('the editor refuses an empty title, focuses it, then saves', async () => {
    const { container: c, onEdit } = calendar()
    key(ev(c, 'a'), 'Enter')
    await flush()
    button('Edit', document.querySelector('[data-scope="event-card"]')!).click()
    await flush()
    const title = [...document.querySelectorAll<HTMLInputElement>('form input')].find(i => i.value === 'Design crit')!
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
    expect(onEdit.mock.calls[0][0]).toMatchObject({ id: 'a', title: 'Crit', start: '2026-10-26T10:00', end: '2026-10-26T11:00' })
  })

  test('read-only events neither lift nor show a resize handle', async () => {
    const { container: c } = calendar({ readOnly: true })
    key(ev(c, 'a'), 'm')
    await flush()
    expect(ev(c, 'a').dataset.state).toBeUndefined()
    expect(c.querySelector('[data-part="resize"]')).toBeNull()
  })
})

describe('MoveSheet', () => {
  test('a colliding start is disabled; Move sends the chosen slot', async () => {
    const open = state(true), onMove = vi.fn()
    render(() => <MoveSheet open={open} event={EVENTS[0]} events={[{ id: 'x', title: 'Busy', start: '2026-10-26T13:00', end: '2026-10-26T14:00' }]} firstDayOfWeek={1} onMove={onMove} />)
    await flush()
    const slots = [...document.querySelectorAll<HTMLButtonElement>('[data-part="slot"]')]
    expect(slots.some(s => s.disabled)).toBe(true)
    slots.find(s => !s.disabled && s.getAttribute('aria-pressed') === 'false')!.click()
    await flush()
    button('Move event').click()
    await flush()
    expect(onMove).toHaveBeenCalledOnce()
    const to = onMove.mock.calls[0][1]
    expect(to.e - to.s).toBe(60)
    expect(open.value).toBe(false)
  })
})

describe('Agenda', () => {
  test('the strip is one stop; arrows change the day and move focus', async () => {
    const { container: c } = render(() => <Agenda events={EVENTS} defaultDate={TODAY} today={TODAY} now="2026-10-28T10:40" locale="en-US" firstDayOfWeek={1} />)
    const tabs = () => [...c.querySelectorAll<HTMLElement>('[role="tab"]')]
    expect(tabs().filter(t => t.tabIndex === 0).length).toBe(1)
    const on = tabs().find(t => t.getAttribute('aria-selected') === 'true')!
    on.focus()
    key(on, 'ArrowRight')
    await flush()
    expect(document.activeElement!.textContent).toContain('Thursday')
    key(document.activeElement!, 'Home')
    await flush()
    expect(document.activeElement!.textContent).toContain('Monday')
    expect(c.querySelector('[data-part="page"]:not([aria-hidden]) [data-id="a"]')).toBeTruthy()
  })

  test('Shift+F10 on a row opens the move sheet', async () => {
    const { container: c } = render(() => <Agenda events={EVENTS} defaultDate="2026-10-26" today={TODAY} locale="en-US" firstDayOfWeek={1} onMove={() => undefined} />)
    key(c.querySelector('[data-part="page"]:not([aria-hidden]) [data-id="a"]')!, 'F10', { shiftKey: true })
    await flush()
    expect(document.body.textContent).toContain('Move “Design crit”')
  })
})

describe('YearView', () => {
  const counts = { '2026-10-28': 6, '2026-10-29': 1 }
  const year = (o: object = {}) => render(() => <YearView counts={counts} today={TODAY} locale="en-US" firstDayOfWeek={1} {...o} />).container
  const stop = (c: Element) => c.querySelectorAll<HTMLElement>('[data-day][tabindex="0"]')

  test('one stop across twelve months; arrows and T walk it', async () => {
    const c = year()
    expect(stop(c).length).toBe(1)
    expect(c.querySelectorAll('[data-part="year-month"]').length).toBe(12)
    key(stop(c)[0], 'ArrowRight')
    await flush()
    expect(stop(c)[0].dataset.day).toBe('2026-10-29')
    key(stop(c)[0], 'PageDown')
    await flush()
    expect(stop(c)[0].dataset.day).toBe('2026-11-29')
    key(stop(c)[0], 't')
    await flush()
    expect(stop(c)[0].dataset.day).toBe(TODAY)
  })

  test('Enter hands the day to the Calendar; otherwise the detail reports it', async () => {
    const openDay = vi.fn(() => true)
    const c = year({ openDay })
    key(stop(c)[0], 'Enter')
    await flush()
    expect(openDay).toHaveBeenCalledWith(TODAY)
    const d = year()
    key(d.querySelector('[data-day][tabindex="0"]')!, 'Enter')
    await flush()
    expect(d.querySelector('[data-part="detail"]')!.textContent).toContain('6 events')
  })
})

describe('BookingCalendar', () => {
  const SLOTS = [{ s: 540 }, { s: 570, disabled: true }, { s: 600 }]
  const pick = async (c: Element) => {
    c.querySelector<HTMLElement>('[data-part="slot"]')!.click()
    await flush()
    button('Continue', c).click()
    await flush()
  }

  test('slots press, a taken one is disabled, confirming books', async () => {
    const onBook = vi.fn()
    const { container: c } = render(() => <BookingCalendar slots={SLOTS} defaultDate="2026-10-28" today={TODAY} locale="en-US" onBook={onBook} />)
    expect(c.querySelectorAll('[data-part="slot"]:disabled').length).toBe(1)
    expect(button('Continue', c).matches(':disabled, [aria-disabled="true"]')).toBe(true)
    await pick(c)
    expect(c.querySelector('[data-part="slot"]')!.getAttribute('aria-pressed')).toBe('true')
    expect(document.activeElement!.textContent).toContain('Confirm')
    button('Confirm', c).click()
    await flush()
    await new Promise(r => setTimeout(r))
    await flush()
    expect(onBook).toHaveBeenCalledWith({ date: '2026-10-28', s: 540, e: 570, manual: false })
    expect(c.textContent).toContain('Booked')
  })

  test('a failed booking stays on confirm and says why', async () => {
    const { container: c } = render(() => <BookingCalendar slots={SLOTS} defaultDate="2026-10-28" today={TODAY} locale="en-US" onBook={() => Promise.reject(new Error('Just taken'))} />)
    await pick(c)
    button('Confirm', c).click()
    await new Promise(r => setTimeout(r))
    await flush()
    expect(c.textContent).toContain('Just taken')
    expect(c.querySelector('[data-confirm-step]')).toBeTruthy()
    expect(await said(true)).toMatch(/Couldn't book/)
  })

  test('the manual field replaces the slots', async () => {
    const { container: c } = render(() => <BookingCalendar slots={SLOTS} defaultDate="2026-10-28" today={TODAY} locale="en-US" onBook={() => undefined} />)
    button('Enter a time', c).click()
    await flush()
    expect(c.querySelector('[data-part="slot"]')).toBeNull()
    expect(c.querySelector('[data-part="segment"]')).toBeTruthy()
  })
})

describe('MeetingPlanner', () => {
  const PEOPLE = [{ id: 'y', name: 'You', organizer: true, busy: [[540, 600]] as [number, number][] }, { id: 'a', name: 'Ana', busy: [[600, 660]] as [number, number][] }]
  const planner = (onSubmit: any = () => undefined) => render(() => <MeetingPlanner date={TODAY} attendees={PEOPLE} title="Review" today={TODAY} locale="en-US" onSubmit={onSubmit} />).container

  test('suggestions are a radiogroup with one stop; arrows pick', async () => {
    const c = planner()
    const radios = () => [...c.querySelectorAll<HTMLElement>('[role="radio"]')]
    expect(radios().length).toBe(3)
    expect(radios().filter(r => r.tabIndex === 0).length).toBe(1)
    radios()[0].focus()
    key(radios()[0], 'ArrowRight')
    await flush()
    expect(radios()[1].getAttribute('aria-checked')).toBe('true')
    expect(document.activeElement).toBe(radios()[1])
  })

  test('Send submits the picked time and confirms', async () => {
    const onSubmit = vi.fn()
    const c = planner(onSubmit)
    button(/Send invite/, c).click()
    await new Promise(r => setTimeout(r))
    await flush()
    expect(onSubmit).toHaveBeenCalledOnce()
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ title: 'Review', date: TODAY, s: 660, e: 690 })
    expect(c.textContent).toContain('Invite sent')
  })

  test('removing someone reopens the times they blocked; the organizer has no remove', async () => {
    const c = planner()
    expect(button('Remove You', c)).toBeUndefined()
    button('Remove Ana', c).click()
    await flush()
    expect(c.textContent).toContain('Attendees 1')
    expect(await said()).toMatch(/Ana removed/)
  })
})

describe('AvailabilityEditor', () => {
  const week = [{ day: 1, on: true, ranges: [[540, 1020]] as [number, number][] }, { day: 2, on: false, ranges: [[540, 720]] as [number, number][] }]
  const editor = (onSave: any) => render(() => <AvailabilityEditor defaultValue={{ week, overrides: [] }} today={TODAY} locale="en-US" onSave={onSave} />).container
  const pickSelect = async (s: HTMLSelectElement, v: string) => { s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); await flush() }

  test('a backwards range shows at once, blocks Save and takes focus', async () => {
    const onSave = vi.fn()
    const c = editor(onSave)
    const [from] = c.querySelectorAll<HTMLSelectElement>('[data-part="range"] select')
    await pickSelect(from, '1080')
    expect(c.querySelector('[data-part="range"][data-invalid]')).toBeTruthy()
    expect(c.querySelector('[data-part="error"]')).toBeTruthy()
    button('Save availability', c).click()
    await flush()
    expect(onSave).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(c.querySelector('[data-part="range"][data-invalid] select'))
    expect(await said(true)).toMatch(/Fix the highlighted ranges/)
  })

  test('nothing saves until Save; Save sends the week', async () => {
    const onSave = vi.fn()
    const c = editor(onSave)
    button('Copy Monday to weekdays', c).click()
    await flush()
    expect(onSave).not.toHaveBeenCalled()
    expect(c.textContent).toContain('Unsaved changes')
    button('Save availability', c).click()
    await new Promise(r => setTimeout(r))
    await flush()
    expect(onSave.mock.calls[0][0].week[1]).toMatchObject({ day: 2, on: true, ranges: [[540, 1020]] })
    expect(c.textContent).toContain('Saved')
  })

  test('adding a range moves focus to it; removing returns to Add', async () => {
    const c = editor(() => undefined)
    button('Add a range on Monday', c).click()
    await flush()
    expect(c.querySelectorAll('[data-day-of="1"] [data-part="range"]').length).toBe(2)
    expect(document.activeElement!.tagName).toBe('SELECT')
    button('Remove Monday range 2', c).click()
    await flush()
    expect(document.activeElement).toBe(c.querySelector('[data-add="1"]'))
  })
})
