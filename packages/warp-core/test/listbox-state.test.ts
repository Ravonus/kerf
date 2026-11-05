// State refactors must preserve the first open, cached rows and callback evaluation order.
import { listbox, type ListboxOptions, type ListItem } from '../src/listbox'
import type { ChangeReason } from '../src/temporal'

const actions: ReturnType<typeof listbox>[] = []
afterEach(() => {
  for (const action of actions.splice(0)) action.destroy()
  document.body.replaceChildren()
})

function setup(options: ListboxOptions) {
  const control = document.createElement('div')
  control.dataset.part = 'control'
  const trigger = document.createElement('button')
  control.append(trigger)
  document.body.append(control)
  const action = listbox(trigger, options)
  actions.push(action)
  return { action, trigger, control }
}

const items = () => [
  { value: 'a', label: 'Alpha', group: 'Team' },
  { value: 'b', label: 'Beta', group: 'Team' },
  { value: 'c', label: 'Closed', disabled: true },
]
const options = (): ListboxOptions => ({
  label: 'Choose',
  items: items(),
  value: 'a',
  presentation: 'popover',
  onPick() {},
})

test('an initially open list initializes rows before selecting the current option', () => {
  const { trigger, control } = setup({ ...options(), open: true })
  expect(trigger.getAttribute('aria-expanded')).toBe('true')
  expect(control.querySelectorAll('[role=option]')).toHaveLength(3)
  expect(control.querySelector('[data-highlighted]')?.textContent).toBe('Alpha')
})

test('an idle update, search, empty search and reopen retain the cached panel', () => {
  const opts = { ...options(), search: true }
  const { action, trigger, control } = setup(opts)
  expect(control.querySelector('[role=listbox]')).toBeNull()
  expect(action.update({ ...opts, open: false })).toBeUndefined()
  trigger.click()
  const panel = control.querySelector('[data-part=content]')!
  const rows = [...control.querySelectorAll('[role=option]')]
  const input = control.querySelector<HTMLInputElement>('input[type=search]')!
  input.value = 'Beta'
  input.dispatchEvent(new Event('input'))
  expect(control.querySelector('[data-highlighted]')).toBe(rows[1])
  input.value = 'missing'
  input.dispatchEvent(new Event('input'))
  expect(control.querySelector<HTMLElement>('[data-part=empty]')!.hidden).toBe(false)
  expect(input.hasAttribute('aria-activedescendant')).toBe(false)
  trigger.click()
  trigger.click()
  expect(control.querySelector('[data-part=content]')).toBe(panel)
  const reopened = control.querySelectorAll('[role=option]')
  for (const [index, row] of rows.entries()) expect(reopened[index]).toBe(row)
  expect(input.value).toBe('')
  expect(control.querySelector('[data-highlighted]')).toBe(rows[0])
})

test('picking captures the current receiver and callback before evaluating its argument', () => {
  const trace: unknown[] = []
  let reading = false
  let reads = 0
  const row: ListItem = {
    label: 'Beta',
    get value() {
      if (reading) {
        trace.push(`value:${++reads}`)
        if (reads === 2) action.update(later)
      }
      return 'b'
    },
  }
  const opts: ListboxOptions = {
    ...options(),
    items: [{ value: 'a', label: 'Alpha' }, row],
    open: true,
    onOpenChange(open) {
      if (!open) action.update(next)
    },
  }
  const later = { ...opts, open: undefined, onPick: () => trace.push('replacement') }
  const next: ListboxOptions = {
    ...opts,
    open: undefined,
    get onPick() {
      trace.push('lookup')
      return function (this: ListboxOptions, value: string, reason: ChangeReason) {
        trace.push(this === next, value, reason)
      }
    },
  }
  const held = setup(opts)
  const action = held.action
  reading = true
  held.control
    .querySelectorAll('[role=option]')[1]!
    .dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  expect(trace).toEqual(['value:1', 'lookup', 'value:2', true, 'b', 'pointer'])
  expect(document.activeElement).toBe(held.trigger)
  expect(held.trigger.getAttribute('aria-expanded')).toBe('false')
  expect(action.destroy()).toBeUndefined()
  expect(held.control.querySelector('[role=listbox]')).toBeNull()
  held.trigger.click()
  expect(held.trigger.getAttribute('aria-expanded')).toBe('false')
})
