// DOM construction must preserve live reads, literal content and cached element identity.
import { listbox, type ListboxOptions } from '../src/listbox'

const actions: ReturnType<typeof listbox>[] = []
afterEach(() => {
  for (const action of actions.splice(0)) action.destroy()
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

function mount(options: ListboxOptions) {
  const control = document.createElement('div')
  control.dataset.part = 'control'
  const trigger = document.createElement('button')
  control.append(trigger)
  document.body.append(control)
  const action = listbox(trigger, options)
  actions.push(action)
  return { control, trigger, action }
}

test('rows keep literal labels, hint order, SVG namespace and separate DOM identities', () => {
  const label = '<img src=x onerror="bad()">'
  const { control } = mount({
    label: 'Pick',
    value: 'a',
    open: true,
    presentation: 'popover',
    items: [
      { value: 'a', label, hint: '<b>Hint</b>', group: 'Group' },
      { value: 'b', label: 'Beta', disabled: true, group: 'Group' },
    ],
    onPick() {},
  })
  const rows = control.querySelectorAll<HTMLElement>('[role="option"]')
  const first = rows[0]!
  expect(first.firstChild!.textContent).toBe(label)
  expect([...first.children].map((el) => el.getAttribute('data-part'))).toEqual([
    'item-hint',
    'indicator',
  ])
  expect(first.querySelector('small')!.textContent).toBe('<b>Hint</b>')
  expect(first.querySelector('img,b')).toBeNull()
  expect(rows[1]!.getAttribute('aria-disabled')).toBe('true')
  const icons = [...control.querySelectorAll('svg')]
  expect(icons).toHaveLength(2)
  expect(icons[0]).not.toBe(icons[1])
  for (const icon of icons) {
    expect(icon.ownerDocument).toBe(document)
    expect(icon.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(icon.firstElementChild!.getAttribute('d')).toBe('M5 12.5 9.5 17 19 7')
  }
})

test('panel and search label reads stay live and keep their evaluation order', () => {
  let reads = 0
  const focus = vi.spyOn(HTMLInputElement.prototype, 'focus')
  const { control, trigger } = mount({
    get label() {
      return `Label ${++reads}`
    },
    value: 'a',
    items: [{ value: 'a', label: 'Alpha' }],
    open: true,
    search: true,
    presentation: 'popover',
    onPick() {},
  })
  const panel = control.querySelector('[data-part="content"]')!
  const input = control.querySelector<HTMLInputElement>('input[type="search"]')!
  const list = control.querySelector('[role="listbox"]')!
  expect(reads).toBe(4)
  expect(panel.getAttribute('aria-label')).toBe('Label 1')
  expect(panel.querySelector('[data-part="sheet-head"] span')!.textContent).toBe('Label 2')
  expect(input.getAttribute('aria-label')).toBe('Search Label 3')
  expect(list.getAttribute('aria-label')).toBe('Label 4')
  expect(input.getAttribute('aria-controls')).toBe(list.id)
  expect(input.getAttribute('aria-autocomplete')).toBe('list')
  expect(input.getAttribute('aria-expanded')).toBe('true')
  expect(input.getAttribute('role')).toBe('combobox')
  expect(focus).toHaveBeenCalledWith({ preventScroll: true })
  expect(focus.mock.contexts[0]).toBe(input)
  trigger.click()
  trigger.click()
  expect(control.querySelector('[data-part="content"]')).toBe(panel)
  expect(control.querySelector('input[type="search"]')).toBe(input)
  expect(reads).toBe(4)
})

test('a delegated pointer event resolves its option once before comparing row identities', () => {
  const { control } = mount({
    label: 'Pick',
    value: '0',
    open: true,
    presentation: 'popover',
    items: Array.from({ length: 100 }, (_, i) => ({ value: String(i), label: `Row ${i}` })),
    onPick() {},
  })
  const rows = control.querySelectorAll('[role="option"]')
  const target = rows[99]!.querySelector('path')!
  const closest = vi.spyOn(target, 'closest')
  const event = new MouseEvent('pointermove', { bubbles: true })
  Object.defineProperty(event, 'pointerType', { value: 'mouse' })
  target.dispatchEvent(event)
  expect(closest).toHaveBeenCalledTimes(1)
  expect(closest.mock.contexts[0]).toBe(target)
  expect(control.querySelector('[data-highlighted]')).toBe(rows[99])
})

test('a list of many toggles rows, stays open, and marks every value that is on', () => {
  const picks: string[] = []
  const opts: ListboxOptions = {
    label: 'Milk',
    value: '',
    multiple: true,
    values: ['oat'],
    open: true,
    presentation: 'popover',
    items: [
      { value: 'oat', label: 'Oat' },
      { value: 'almond', label: 'Almond' },
    ],
    onPick: (v) => picks.push(v),
  }
  const { control, trigger, action } = mount(opts)
  const list = control.querySelector('[role="listbox"]')!
  expect(list.getAttribute('aria-multiselectable')).toBe('true')
  const rows = control.querySelectorAll<HTMLElement>('[role="option"]')
  expect([...rows].map((r) => r.getAttribute('aria-selected'))).toEqual(['true', 'false'])
  rows[1]!.click()
  expect(picks).toEqual(['almond'])
  action.update({ ...opts, values: ['oat', 'almond'] })
  expect(trigger.getAttribute('aria-expanded')).toBe('true')
  expect([...rows].map((r) => r.getAttribute('aria-selected'))).toEqual(['true', 'true'])
})
