// The schedule pack driven as a user would: views, keyboard move, the card, dialogs, rollback, and the fields paths (07 §2, §6.4).
import { registerCalendar } from './schedule/calendar'
import { button, EVENTS, key, said, TODAY } from './schedule/support'
import { state } from '@kerf-js/core'
import { flush, render } from '@kerf-js/core/test'
import { Agenda } from '../src/schedule/Agenda'
import { AvailabilityEditor } from '../src/schedule/AvailabilityEditor'
import { BookingCalendar } from '../src/schedule/BookingCalendar'
import { MeetingPlanner } from '../src/schedule/MeetingPlanner'
import { MoveSheet } from '../src/schedule/MoveSheet'
import { YearView } from '../src/schedule/YearView'

beforeAll(() => {
  document.head.append(
    Object.assign(document.createElement('style'), {
      textContent: 'dialog { display: block !important }',
    }),
  )
})
// what Toaster mounts: without it `announce` has nowhere to speak
beforeEach(() => {
  document.body.replaceChildren(
    ...['polite', 'assertive'].map((live) => {
      const n = document.createElement('div')
      n.dataset.scope = 'announcer'
      n.setAttribute('aria-live', live)
      return n
    }),
  )
})
afterEach(() => {
  document.body.replaceChildren()
})

registerCalendar()

describe('MoveSheet', () => {
  test('a colliding start is disabled; Move sends the chosen slot', async () => {
    const open = state(true),
      onMove = vi.fn()
    render(() => (
      <MoveSheet
        open={open}
        event={EVENTS[0]!}
        events={[{ id: 'x', title: 'Busy', start: '2026-10-26T13:00', end: '2026-10-26T14:00' }]}
        firstDayOfWeek={1}
        onMove={onMove}
      />
    ))
    await flush()
    const slots = [...document.querySelectorAll<HTMLButtonElement>('[data-part="slot"]')]
    expect(slots.some((s) => s.disabled)).toBe(true)
    slots.find((s) => !s.disabled && s.getAttribute('aria-pressed') === 'false')!.click()
    await flush()
    button('Move event').click()
    await flush()
    expect(onMove).toHaveBeenCalledOnce()
    const to = onMove.mock.calls[0]![1]
    expect(to.e - to.s).toBe(60)
    expect(open.value).toBe(false)
  })
})

describe('Agenda', () => {
  test('the strip is one stop; arrows change the day and move focus', async () => {
    const { container: c } = render(() => (
      <Agenda
        events={EVENTS}
        defaultDate={TODAY}
        today={TODAY}
        now="2026-10-28T10:40"
        locale="en-US"
        firstDayOfWeek={1}
      />
    ))
    const tabs = () => [...c.querySelectorAll<HTMLElement>('[role="tab"]')]
    expect(tabs().filter((t) => t.tabIndex === 0).length).toBe(1)
    const on = tabs().find((t) => t.getAttribute('aria-selected') === 'true')!
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
    const { container: c } = render(() => (
      <Agenda
        events={EVENTS}
        defaultDate="2026-10-26"
        today={TODAY}
        locale="en-US"
        firstDayOfWeek={1}
        onMove={() => undefined}
      />
    ))
    key(c.querySelector('[data-part="page"]:not([aria-hidden]) [data-id="a"]')!, 'F10', {
      shiftKey: true,
    })
    await flush()
    expect(document.body.textContent).toContain('Move “Design crit”')
  })
})

describe('YearView', () => {
  const counts = { '2026-10-28': 6, '2026-10-29': 1 }
  const year = (o: object = {}) =>
    render(() => (
      <YearView counts={counts} today={TODAY} locale="en-US" firstDayOfWeek={1} {...o} />
    )).container
  const stop = (c: Element) => c.querySelectorAll<HTMLElement>('[data-day][tabindex="0"]')

  test('one stop across twelve months; arrows and T walk it', async () => {
    const c = year()
    expect(stop(c).length).toBe(1)
    expect(c.querySelectorAll('[data-part="year-month"]').length).toBe(12)
    key(stop(c)[0]!, 'ArrowRight')
    await flush()
    expect(stop(c)[0]!.dataset.day).toBe('2026-10-29')
    key(stop(c)[0]!, 'PageDown')
    await flush()
    expect(stop(c)[0]!.dataset.day).toBe('2026-11-29')
    key(stop(c)[0]!, 't')
    await flush()
    expect(stop(c)[0]!.dataset.day).toBe(TODAY)
  })

  test('Enter hands the day to the Calendar; otherwise the detail reports it', async () => {
    const openDay = vi.fn(() => true)
    const c = year({ openDay })
    key(stop(c)[0]!, 'Enter')
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
    const { container: c } = render(() => (
      <BookingCalendar
        slots={SLOTS}
        defaultDate="2026-10-28"
        today={TODAY}
        locale="en-US"
        onBook={onBook}
      />
    ))
    expect(c.querySelectorAll('[data-part="slot"]:disabled').length).toBe(1)
    expect(button('Continue', c).matches(':disabled, [aria-disabled="true"]')).toBe(true)
    await pick(c)
    expect(c.querySelector('[data-part="slot"]')!.getAttribute('aria-pressed')).toBe('true')
    expect(document.activeElement!.textContent).toContain('Confirm')
    button('Confirm', c).click()
    await flush()
    await new Promise((r) => {
      setTimeout(r)
    })
    await flush()
    expect(onBook).toHaveBeenCalledWith({ date: '2026-10-28', s: 540, e: 570, manual: false })
    expect(c.textContent).toContain('Booked')
  })

  test('a failed booking stays on confirm and says why', async () => {
    const { container: c } = render(() => (
      <BookingCalendar
        slots={SLOTS}
        defaultDate="2026-10-28"
        today={TODAY}
        locale="en-US"
        onBook={() => Promise.reject(new Error('Just taken'))}
      />
    ))
    await pick(c)
    button('Confirm', c).click()
    await new Promise((r) => {
      setTimeout(r)
    })
    await flush()
    expect(c.textContent).toContain('Just taken')
    expect(c.querySelector('[data-confirm-step]')).toBeTruthy()
    expect(await said(true)).toMatch(/Couldn't book/)
  })

  test('the manual field replaces the slots', async () => {
    const { container: c } = render(() => (
      <BookingCalendar
        slots={SLOTS}
        defaultDate="2026-10-28"
        today={TODAY}
        locale="en-US"
        onBook={() => undefined}
      />
    ))
    button('Enter a time', c).click()
    await flush()
    expect(c.querySelector('[data-part="slot"]')).toBeNull()
    expect(c.querySelector('[data-part="segment"]')).toBeTruthy()
  })
})

describe('MeetingPlanner', () => {
  const PEOPLE = [
    { id: 'y', name: 'You', organizer: true, busy: [[540, 600]] as [number, number][] },
    { id: 'a', name: 'Ana', busy: [[600, 660]] as [number, number][] },
  ]
  const planner = (onSubmit: Parameters<typeof MeetingPlanner>[0]['onSubmit'] = () => undefined) =>
    render(() => (
      <MeetingPlanner
        date={TODAY}
        attendees={PEOPLE}
        title="Review"
        today={TODAY}
        locale="en-US"
        onSubmit={onSubmit}
      />
    )).container

  test('suggestions are a radiogroup with one stop; arrows pick', async () => {
    const c = planner()
    const radios = () => [...c.querySelectorAll<HTMLElement>('[role="radio"]')]
    expect(radios().length).toBe(3)
    expect(radios().filter((r) => r.tabIndex === 0).length).toBe(1)
    radios()[0]!.focus()
    key(radios()[0]!, 'ArrowRight')
    await flush()
    expect(radios()[1]!.getAttribute('aria-checked')).toBe('true')
    expect(document.activeElement).toBe(radios()[1])
  })

  test('Send submits the picked time and confirms', async () => {
    const onSubmit = vi.fn()
    const c = planner(onSubmit)
    button(/Send invite/, c).click()
    await new Promise((r) => {
      setTimeout(r)
    })
    await flush()
    expect(onSubmit).toHaveBeenCalledOnce()
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({
      title: 'Review',
      date: TODAY,
      s: 660,
      e: 690,
    })
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
  const week = [
    { day: 1, on: true, ranges: [[540, 1020]] as [number, number][] },
    { day: 2, on: false, ranges: [[540, 720]] as [number, number][] },
  ]
  const editor = (onSave: Parameters<typeof AvailabilityEditor>[0]['onSave']) =>
    render(() => (
      <AvailabilityEditor
        defaultValue={{ week, overrides: [] }}
        today={TODAY}
        locale="en-US"
        onSave={onSave}
      />
    )).container
  const pickSelect = async (s: HTMLSelectElement, v: string) => {
    s.value = v
    s.dispatchEvent(new Event('change', { bubbles: true }))
    await flush()
  }

  test('a backwards range shows at once, blocks Save and takes focus', async () => {
    const onSave = vi.fn()
    const c = editor(onSave)
    const [from] = c.querySelectorAll<HTMLSelectElement>('[data-part="range"] select')
    await pickSelect(from!, '1080')
    expect(c.querySelector('[data-part="range"][data-invalid]')).toBeTruthy()
    expect(c.querySelector('[data-part="error"]')).toBeTruthy()
    button('Save availability', c).click()
    await flush()
    expect(onSave).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(
      c.querySelector('[data-part="range"][data-invalid] [role="combobox"]'),
    )
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
    await new Promise((r) => {
      setTimeout(r)
    })
    await flush()
    expect(onSave.mock.calls[0]![0].week[1]).toMatchObject({
      day: 2,
      on: true,
      ranges: [[540, 1020]],
    })
    expect(c.textContent).toContain('Saved')
  })

  test('adding a range moves focus to it; removing returns to Add', async () => {
    const c = editor(() => undefined)
    button('Add a range on Monday', c).click()
    await flush()
    expect(c.querySelectorAll('[data-day-of="1"] [data-part="range"]').length).toBe(2)
    expect(document.activeElement!.getAttribute('role')).toBe('combobox')
    button('Remove Monday range 2', c).click()
    await flush()
    expect(document.activeElement).toBe(c.querySelector('[data-add="1"]'))
  })
})
