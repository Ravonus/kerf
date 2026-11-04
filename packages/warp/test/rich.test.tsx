// The rich inputs: keyboard behaviour against 04 §1.3–1.4, ARIA wiring, and SSR + hydration with the locale pinned.
import { resetIds } from '@weft-js/warp-core'
import { hydrate } from '@weft-js/core/dom'
import { renderToString } from '@weft-js/core/ssr'
import { flush, render } from '@weft-js/core/test'
import { hydration } from '../../core/src/hydrate'
import * as C from './fixtures/Rich'
// @ts-expect-error: query imports (@weft-js/core/vite)
const server = await import('./fixtures/Rich.tsx?weft-ssr')
// @ts-expect-error: query imports (@weft-js/core/vite)
const client = await import('./fixtures/Rich.tsx?weft-hydrate')

// jsdom has no popover top layer: a closed <dialog> stays display:none and refuses focus
beforeAll(() => {
  document.head.append(
    Object.assign(document.createElement('style'), {
      textContent: 'dialog { display: block !important }',
    }),
  )
})

const key = (el: Element, k: string, init: KeyboardEventInit = {}) =>
  el.dispatchEvent(
    new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }),
  )
const seg = (c: Element, type: string) =>
  c.querySelector<HTMLElement>(`[data-part="segment"][data-type="${type}"]`)!
const out = (c: Element) => c.querySelector('[data-out]')!.textContent

test.each(Object.keys(server).filter((n) => !n.endsWith('$shape')))(
  '%s: SSR + hydrate, 0 misses, 0 writes',
  async (name) => {
    resetIds()
    const html = renderToString(() => server[name]())
    const root = document.body.appendChild(document.createElement('div'))
    root.innerHTML = html
    const writes: MutationRecord[] = []
    const observer = new MutationObserver((r) => writes.push(...r))
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    })
    resetIds()
    const dispose = hydrate(() => client[name](), root)
    writes.push(...observer.takeRecords())
    observer.disconnect()
    expect(hydration.misses).toBe(0)
    expect(writes.length).toBe(0)
    await flush()
    dispose()
    root.remove()
  },
)

test('segments render in the locale order with spinbutton names', async () => {
  const { container } = render(C.DateFieldCase)
  await flush()
  const spins = [...container.querySelectorAll('[role="spinbutton"]')]
  expect(spins.map((s) => s.getAttribute('data-type'))).toEqual(['month', 'day', 'year'])
  expect(seg(container, 'month').getAttribute('aria-valuetext')).toBe('October')
  expect(seg(container, 'month').getAttribute('aria-valuenow')).toBe('10')
  const body = container.querySelector('[data-part="body"]')!
  expect(body.getAttribute('role')).toBe('group')
  expect(document.getElementById(body.getAttribute('aria-labelledby')!)!.textContent).toContain(
    'Due date',
  )
})

test('typing a segment moves on when no further digit fits, and only a whole date is a value', async () => {
  const { container } = render(C.DateFieldCase)
  await flush()
  key(seg(container, 'day'), 'Backspace')
  key(seg(container, 'day'), 'Backspace')
  await flush()
  expect(out(container)).toBe('null')
  key(seg(container, 'day'), '4')
  await flush()
  expect(out(container)).toBe('2026-10-04')
  key(seg(container, 'month'), 'ArrowUp')
  await flush()
  expect(out(container)).toBe('2026-11-04')
  key(seg(container, 'month'), 'ArrowDown')
  await flush()
  expect(seg(container, 'month').textContent).toBe('10')
})

test('31 Feb is explained, not a value', async () => {
  const { container } = render(C.DateFieldCase)
  await flush()
  key(seg(container, 'day'), '3')
  key(seg(container, 'day'), '1')
  await flush()
  key(seg(container, 'month'), '0')
  key(seg(container, 'month'), '2')
  await flush()
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    'February 2026 has 28 days',
  )
  expect(container.querySelector('[data-part="body"]')!.getAttribute('aria-invalid')).toBe('true')
})

const grid = async (c: HTMLElement) => {
  await flush()
  return c.querySelector<HTMLElement>('[data-part="day"][tabindex="0"]')!
}

test('the grid has one tab stop, full day names, and APG keys', async () => {
  const { container } = render(C.CalendarCase)
  let day = await grid(container)
  expect(container.querySelectorAll('[data-part="day"][tabindex="0"]').length).toBe(1)
  expect(day.getAttribute('aria-label')).toBe('Wednesday, October 14, 2026')
  expect(container.querySelector('[aria-current="date"]')!.getAttribute('aria-label')).toBe(
    'Wednesday, October 28, 2026, today',
  )
  key(day, 'ArrowRight')
  day = await grid(container)
  expect(day.dataset.date).toBe('2026-10-15')
  key(day, 'ArrowDown')
  day = await grid(container)
  expect(day.dataset.date).toBe('2026-10-22')
  key(day, 'PageDown')
  day = await grid(container)
  expect(day.dataset.date).toBe('2026-11-22')
  expect(container.querySelector('[data-part="caption"]')!.textContent).toBe('November 2026')
  key(day, 'Home')
  day = await grid(container)
  expect(day.dataset.date).toBe('2026-11-22')
  key(day, 'End')
  day = await grid(container)
  expect(day.dataset.date).toBe('2026-11-28')
  key(day, 'Enter')
  await flush()
  expect(out(container)).toBe('2026-11-28')
  expect(
    container
      .querySelector('td[aria-selected="true"] [data-part="day"]')!
      .getAttribute('data-date'),
  ).toBe('2026-11-28')
})

test('PageUp keeps the day where the month has it, Shift+Page moves a year', async () => {
  const { container } = render(C.CalendarCase)
  let day = await grid(container)
  key(day, 'PageUp', { shiftKey: true })
  day = await grid(container)
  expect(day.dataset.date).toBe('2025-10-14')
  expect(container.querySelector('[data-part="months"]')!.getAttribute('data-anim')).toBe('prev')
})

test('the trigger opens the panel onto the selected day, Escape closes it', async () => {
  const { container } = render(C.DateFieldOpenCase)
  await flush()
  const t = container.querySelector<HTMLElement>('[data-part="trigger"]')!
  expect(t.getAttribute('aria-expanded')).toBe('false')
  expect(container.querySelector('[data-scope="calendar"]')).toBeNull()
  t.click()
  await flush()
  expect(t.getAttribute('aria-expanded')).toBe('true')
  expect(container.querySelector('[data-part="control"]')!.hasAttribute('data-hold')).toBe(true)
  expect(document.activeElement?.getAttribute('data-date')).toBe('2026-10-14')
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  await flush()
  expect(t.getAttribute('aria-expanded')).toBe('false')
})

test('range picks start then end, swapped if earlier, and says so in the day names', async () => {
  const { container } = render(C.RangeFieldCase)
  await flush()
  container.querySelector<HTMLElement>('[data-part="trigger"]')!.click()
  await flush()
  expect(container.querySelector('[data-date="2026-10-12"]')!.getAttribute('aria-label')).toContain(
    'start of range',
  )
  expect(container.querySelector('[data-date="2026-10-13"]')!.getAttribute('aria-label')).toContain(
    'in range',
  )
  expect(container.querySelector('[data-date="2026-10-16"]')!.getAttribute('aria-label')).toContain(
    'end of range',
  )
  container.querySelector<HTMLElement>('[data-date="2026-10-20"]')!.click()
  await flush()
  container.querySelector<HTMLElement>('[data-date="2026-10-09"]')!.click()
  await flush()
  expect(container.querySelector('[data-part="foot"] span')!.textContent).toContain('Oct 9')
  expect(container.querySelector('[data-part="foot"] span')!.textContent).toContain('12 days')
})

test('a preset fills the range and keeps its id', async () => {
  const { container } = render(C.RangeFieldCase)
  await flush()
  container.querySelector<HTMLElement>('[data-part="trigger"]')!.click()
  await flush()
  container.querySelector<HTMLElement>('[data-id="7d"]')!.click()
  await flush()
  expect(container.querySelector('[data-id="7d"]')!.getAttribute('aria-selected')).toBe('true')
  expect(container.querySelector('[data-part="foot"] span')!.textContent).toContain('7 days')
})

test('a 12-hour time splits into hour, minute and period, and the slot list picks', async () => {
  const { container } = render(C.TimeFieldCase)
  await flush()
  expect(
    [...container.querySelectorAll('[role="spinbutton"]')].map((s) => s.getAttribute('data-type')),
  ).toEqual(['hour', 'minute', 'dayPeriod'])
  key(seg(container, 'dayPeriod'), 'p')
  await flush()
  expect(out(container)).toBe('21:30')
  container.querySelector<HTMLElement>('[data-part="trigger"]')!.click()
  await flush()
  const lb = container.querySelector<HTMLElement>('[role="listbox"]')!
  expect(document.activeElement).toBe(lb)
  key(lb, 'ArrowDown')
  await flush()
  key(lb, 'Enter')
  await flush()
  expect(out(container)).toBe('21:45')
})

test('a date-time holds one wall-clock value', async () => {
  const { container } = render(C.DateTimeFieldCase)
  await flush()
  expect(container.querySelector('[data-part="hint"]')!.textContent).toContain(
    'wall clock, no zone',
  )
  key(seg(container, 'day'), 'ArrowUp')
  await flush()
  expect(out(container)).toBe('2026-11-05T10:00')
})

test('MonthPicker: named cells, arrows by row, picks', async () => {
  const { container } = render(C.MonthCase)
  await flush()
  container.querySelector<HTMLElement>('[data-part="pick"]')!.click()
  await flush()
  const cell = document.activeElement as HTMLElement
  expect(cell.querySelector('.sr')!.textContent).toBe('October 2026, this period')
  key(cell, 'ArrowDown')
  await flush()
  expect(document.activeElement?.querySelector('.sr')!.textContent).toBe('January 2027')
  key(document.activeElement!, 'Enter')
  await flush()
  expect(out(container)).toBe('2027-01')
})

test('WeekPicker selects the whole row and shows week numbers', async () => {
  const { container } = render(C.WeekCase)
  await flush()
  container.querySelector<HTMLElement>('[data-part="pick"]')!.click()
  await flush()
  expect(container.querySelectorAll('td[aria-selected="true"]').length).toBeGreaterThanOrEqual(6)
  expect(container.querySelector('[data-part="week"]')).not.toBeNull()
  container.querySelector<HTMLElement>('[data-date="2026-10-14"]')!.click()
  await flush()
  expect(out(container)).toBe('2026-W42')
})

test('PeriodPicker keeps the granularity of its value', async () => {
  const { container } = render(C.PeriodCase)
  await flush()
  container.querySelector<HTMLElement>('[data-part="pick"]')!.click()
  await flush()
  expect(container.querySelector('[data-v="2026-Q1"] .sr')!.textContent).toBe('Q1 2026, Jan to Mar')
  ;(container.querySelector('[data-v="2026-Q1"]') as HTMLElement).click()
  await flush()
  expect(out(container)).toBe('2026-Q1')
})

test('TimeZoneSelect searches names and offsets', async () => {
  const { container } = render(C.ZoneCase)
  await flush()
  container.querySelector<HTMLElement>('[data-part="pick"]')!.click()
  await flush()
  const q = document.activeElement as HTMLInputElement
  expect(q.getAttribute('role')).toBe('combobox')
  q.value = '+5:30'
  q.dispatchEvent(new Event('input', { bubbles: true }))
  await flush()
  expect(container.querySelector('[role="option"]')!.textContent).toContain('Kolkata')
  key(q, 'Enter')
  await flush()
  expect(out(container)).toBe('Asia/Kolkata')
})

test('Intl selects name their options in the UI locale', async () => {
  const lang = render(C.LanguageCase).container
  await flush()
  expect(lang.querySelector('[data-part="pick"] span')!.textContent).toBe('German')
  const cur = render(C.CurrencyCase).container
  await flush()
  expect(cur.querySelector('[data-part="pick"] span')!.textContent).toBe('Euro · EUR')
})

test('PhoneField formats as you type and is a value only when whole', async () => {
  const { container } = render(C.PhoneCase)
  await flush()
  const i = container.querySelector<HTMLInputElement>('input[type="tel"]')!
  i.value = '4155550'
  i.dispatchEvent(new Event('input', { bubbles: true }))
  await flush()
  expect(i.value).toBe('(415) 555-0')
  expect(out(container)).toBe('null')
  i.value = '4155550132'
  i.dispatchEvent(new Event('input', { bubbles: true }))
  await flush()
  expect(i.value).toBe('(415) 555-0132')
  expect(out(container)).toBe('+14155550132')
})

test('DurationField steps with carry and balances', async () => {
  const { container } = render(C.DurationCase)
  await flush()
  const m = container.querySelector<HTMLElement>('[data-u="m"]')!
  expect(m.getAttribute('aria-valuetext')).toBe('30 minutes')
  for (let n = 0; n < 7; n++) {
    key(m, 'ArrowUp')
    await flush()
  }
  expect(out(container)).toBe('PT2H5M')
})

test('RecurrenceField leads with the sentence and writes an RRULE', async () => {
  const { container } = render(C.RecurrenceCase)
  await flush()
  expect(container.querySelector('.rr-sentence')!.textContent).toBe(
    'Every 2 weeks on Tuesday and Thursday.',
  )
  const li = [...container.querySelectorAll('.rr-next li')].map((x) => x.textContent)
  expect(li.length).toBe(5)
  expect(li[0]).toContain('Oct 29, 2026')
  container.querySelector<HTMLElement>('[data-day="FR"]')!.click()
  await flush()
  expect(out(container)).toContain('BYDAY=TU,TH,FR')
})

test('a rule with parts the field cannot edit stays read-only and whole', async () => {
  const { container } = render(C.CustomRuleCase)
  await flush()
  expect(container.querySelector('.rr-sentence')!.textContent).toBe('Custom rule')
  expect(container.querySelector('.readout b')!.textContent).toBe('FREQ=WEEKLY;BYSETPOS=2')
})

const settle = () =>
  new Promise((r) => {
    setTimeout(r, 160)
  })
const type = (i: HTMLInputElement, t: string) => {
  i.value = t
  i.dispatchEvent(new Event('input', { bubbles: true }))
}

test('PlaceLookupInput keeps focus in the input and picks with Enter', async () => {
  const { container } = render(C.PlaceCase)
  await flush()
  const i = container.querySelector<HTMLInputElement>('[role="combobox"]')!
  i.focus()
  type(i, 'li')
  await settle()
  await flush()
  expect(i.getAttribute('aria-expanded')).toBe('true')
  expect(i.getAttribute('aria-activedescendant')).toMatch(/-0$/)
  expect(document.activeElement).toBe(i)
  key(i, 'ArrowDown')
  key(i, 'Enter')
  await flush()
  expect(out(container)).toBe('Lima, Peru')
  expect(i.getAttribute('aria-expanded')).toBe('false')
  key(i, 'Escape')
  await flush()
  expect(out(container)).toBe('null')
})

test('AddressField lets the country decide the fields', async () => {
  const { container } = render(C.AddressCase)
  await flush()
  const labels = () =>
    [...container.querySelectorAll('.addr-grid [autocomplete]')].map((i) =>
      i.getAttribute('autocomplete'),
    )
  expect(labels()).toEqual([
    'address-line1',
    'address-line2',
    'address-level2',
    'address-level1',
    'postal-code',
  ])
  const zip = container.querySelector<HTMLInputElement>('[autocomplete="postal-code"]')!
  type(zip, '12')
  zip.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  await flush()
  expect(out(container)).toContain('"postalCode":"12"')
})

test('AddressField falls back to manual entry when the provider fails', async () => {
  const { container } = render(C.AddressFailCase)
  await flush()
  const i = container.querySelector<HTMLInputElement>('[role="combobox"]')!
  type(i, '16')
  await settle()
  await flush()
  expect(container.querySelector('[role="combobox"]')).toBeNull()
  expect(container.textContent).toContain('Suggestions are unavailable')
})

test('PaymentCardInput follows provider events and renders no card input', async () => {
  const { container } = render(C.CardCase)
  await flush()
  await flush()
  const host = container.querySelector<
    HTMLElement & { fire(event: string, detail: unknown): void }
  >('[data-part="provider"]')!
  expect(container.querySelector('input')).toBeNull()
  host.fire('change', { error: 'Your card number is incomplete.' })
  await flush()
  expect(container.textContent).toContain('Your card number is incomplete.')
  expect(container.querySelector('[data-card-text] > [aria-hidden]')!.textContent).toBe(
    'Visa •••• 4242 · 09/28',
  )
  expect(container.querySelector('[data-card-text] > [data-part="sr-only"]')!.textContent).toBe(
    'Visa ending 4242, expires 09/28',
  )
})

test('SignaturePad can be signed from the keyboard', async () => {
  const { container } = render(C.SignatureCase)
  await flush()
  expect(container.querySelector('canvas')!.getAttribute('aria-label')).toBe('Signature, empty')
  container.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1]!.click()
  await flush()
  const t = container.querySelector<HTMLInputElement>('[data-part="typed"]')!
  type(t, 'Ada Lovelace')
  await flush()
  expect(out(container)).toBe('Ada Lovelace')
})

test('a field re-reads the page background when the theme changes after mount', async () => {
  document.body.style.backgroundColor = 'rgb(255, 255, 255)'
  const { container } = render(C.DateFieldCase)
  await flush()
  await new Promise((r) => {
    requestAnimationFrame(r)
  })
  await new Promise((r) => {
    setTimeout(r, 40)
  })
  const label = container.querySelector<HTMLElement>('[data-part="label"]')!
  expect(label.style.getPropertyValue('--_notch-color')).toBe('rgb(255, 255, 255)')
  document.body.style.backgroundColor = 'rgb(15, 12, 7)'
  document.documentElement.dataset.theme = 'dark'
  await new Promise((r) => {
    setTimeout(r, 450)
  })
  expect(label.style.getPropertyValue('--_notch-color')).toBe('rgb(15, 12, 7)')
  delete document.documentElement.dataset.theme
  document.body.style.backgroundColor = ''
})
