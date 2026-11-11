import { render } from '@kerf-js/core/test'
import type { CalEvent } from '@kerf-js/veneer-core'
import { Calendar } from '../../src/schedule/Calendar'

export const TODAY = '2026-10-28'

export const EVENTS: CalEvent[] = [
  {
    id: 'a',
    title: 'Design crit',
    start: '2026-10-26T10:00',
    end: '2026-10-26T11:00',
    cal: 2,
    location: 'Studio',
  },
  {
    id: 'b',
    title: 'Standup',
    start: '2026-10-27T09:00',
    end: '2026-10-27T09:30',
    cal: 1,
    recurrence: 'FREQ=WEEKLY',
  },
  {
    id: 'c',
    title: 'Focus',
    start: '2026-10-28T14:00',
    end: '2026-10-28T15:00',
    cal: 3,
    locked: true,
  },
]

export const key = (el: Element, k: string, init: KeyboardEventInit = {}) =>
  el.dispatchEvent(
    new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }),
  )

export const button = (name: string | RegExp, root: ParentNode = document) =>
  [...root.querySelectorAll<HTMLElement>('button')].find((b) =>
    typeof name === 'string'
      ? (b.getAttribute('aria-label') ?? b.textContent ?? '').trim() === name
      : name.test(b.textContent ?? ''),
  )!

export const tab = (c: Element, name: string) =>
  [...c.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) => t.textContent === name)!

export const ev = (c: Element, id: string) => c.querySelector<HTMLElement>(`[data-id="${id}"]`)!

export const said = async (assertive = false) => {
  await new Promise((r) => {
    setTimeout(r, 70)
  })
  return document.querySelector(
    `[data-scope="announcer"][aria-live="${assertive ? 'assertive' : 'polite'}"]`,
  )!.textContent
}

export function calendar(over: Partial<Parameters<typeof Calendar>[0]> = {}) {
  const onMove = vi.fn(),
    onResize = vi.fn(),
    onDelete = vi.fn(),
    onEdit = vi.fn(),
    onCreate = vi.fn()
  const r = render(() => (
    <Calendar
      events={EVENTS}
      defaultView="week"
      defaultDate={TODAY}
      today={TODAY}
      now="2026-10-28T10:40"
      locale="en-US"
      firstDayOfWeek={1}
      onMove={onMove}
      onResize={onResize}
      onDelete={onDelete}
      onEdit={onEdit}
      onCreate={onCreate}
      {...over}
    />
  ))
  return { ...r, onMove, onResize, onDelete, onEdit, onCreate }
}
