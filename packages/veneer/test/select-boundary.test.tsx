// Real consumers cover the private list state and keyed native option renderers.
import { state } from '@kerf-js/core'
import { render } from '@kerf-js/core/test'
import { CompactSelect, Select, type Option, type OptionGroup } from '../src/Select'
import { key, tick } from './select/support'

type Props = Parameters<typeof Select>[0]
const options = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Bean' },
  { value: 'c', label: 'Corn' },
]

function comments(root: Element) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT)
  const found: Node[] = []
  while (walker.nextNode()) found.push(walker.currentNode)
  return found
}

test('inner group options keep keys across replacement and reorder with live values', async () => {
  const groupOptions = state<Option[]>(options.slice(1))
  const choices: (Option | OptionGroup)[] = [
    options[0]!,
    {
      group: 'Vegetables',
      get options() {
        return groupOptions.value
      },
    },
    { value: 'd', label: 'Dates' },
  ]
  const selected = state<string | null>('b')
  const { container, unmount } = render(() => (
    <Select label="Food" options={choices} value={selected} />
  ))
  await tick()
  const carrier = container.querySelector('select')!
  const group = carrier.querySelector('optgroup')!
  const nodes = new Map([...carrier.options].map((option) => [option.value, option]))
  const markers = comments(carrier)
  groupOptions.value = [
    { value: 'c', label: 'New corn', disabled: true },
    { value: 'b', label: 'New bean' },
  ]
  selected.value = 'c'
  await tick()
  expect(carrier.querySelector('optgroup')).toBe(group)
  expect([...carrier.options].map((option) => option.value)).toEqual(['a', 'c', 'b', 'd'])
  for (const option of carrier.options) expect(option).toBe(nodes.get(option.value))
  expect([...carrier.options].map((option) => option.textContent)).toEqual([
    'Apple',
    'New corn',
    'New bean',
    'Dates',
  ])
  expect(nodes.get('c')!.disabled).toBe(true)
  expect(carrier.value).toBe('c')
  expect(container.querySelector('[data-part=value]')!.textContent).toBe('New corn')
  const current = comments(carrier)
  expect(current).toHaveLength(markers.length)
  expect(current.every((node) => markers.includes(node))).toBe(true)
  unmount()
})

test('a native group can become a plain option under the same outer key and back', async () => {
  const choices = state<(Option | OptionGroup)[]>([{ group: 'same', options }])
  const value = state<string | null>('a')
  const { container, unmount } = render(() => (
    <Select label="Food" options={choices.value} value={value} />
  ))
  await tick()
  const carrier = container.querySelector('select')!
  expect(carrier.querySelector('optgroup')!.label).toBe('same')
  choices.value = [{ value: 'same', label: 'Plain' }]
  value.value = 'same'
  await tick()
  expect(carrier.querySelector('optgroup')).toBeNull()
  expect(carrier.options).toHaveLength(1)
  expect(carrier.value).toBe('same')
  expect(carrier.options[0]!.textContent).toBe('Plain')
  choices.value = [{ group: 'same', options: [options[1]!, options[0]!] }]
  value.value = 'b'
  await tick()
  expect(carrier.querySelector('optgroup')!.label).toBe('same')
  expect([...carrier.options].map((option) => option.value)).toEqual(['b', 'a'])
  expect(carrier.value).toBe('b')
  unmount()
})

test('input precedes change and a handler-written carrier value survives refresh and reset', async () => {
  const trace: string[] = []
  const receivers: unknown[] = []
  const props: Props = {
    label: 'Food',
    name: 'fruit',
    options,
    defaultValue: 'a',
    onInput(this: unknown, event: Event) {
      receivers.push(this)
      trace.push(`input:${(event.currentTarget as HTMLSelectElement).value}`)
    },
    onChange(this: unknown, event) {
      receivers.push(this)
      trace.push(`change:${event.currentTarget.value}`)
      event.currentTarget.value = 'a'
    },
    onValueChange(this: unknown, value, reason) {
      expect(this).toBeUndefined()
      trace.push(`value:${value}:${reason}`)
    },
  }
  const { container, unmount } = render(() => <form>{Select(props)}</form>)
  await tick()
  const trigger = container.querySelector<HTMLButtonElement>('[role=combobox]')!
  const carrier = container.querySelector('select')!
  const nativeEvents: string[] = []
  carrier.addEventListener('input', () => nativeEvents.push('input'))
  carrier.addEventListener('change', () => nativeEvents.push('change'))
  key(trigger, 'ArrowDown')
  key(trigger, 'ArrowDown')
  key(trigger, 'Enter')
  await tick()
  expect(nativeEvents).toEqual(['input', 'change'])
  expect(trace).toEqual(['change:b', 'input:a', 'value:a:keyboard'])
  expect(receivers).toHaveLength(2)
  expect(receivers[0]).toBe(receivers[1])
  expect((receivers[0] as { name: string }).name).toBe('fruit')
  expect(carrier.value).toBe('a')
  carrier.value = 'c'
  trigger.dispatchEvent(new FocusEvent('focus'))
  await tick()
  expect(container.querySelector('[data-part=value]')!.textContent).toBe('Corn')
  expect(new FormData(container.querySelector('form')!).get('fruit')).toBe('c')
  container.querySelector('form')!.reset()
  await tick()
  await tick()
  expect(carrier.value).toBe('a')
  expect(container.querySelector('[data-part=value]')!.textContent).toBe('Apple')
  unmount()
})

test.each([
  ['Select', Select],
  ['CompactSelect', CompactSelect],
] as const)(
  '%s captures one live callback lookup, keeps its unbound receiver and suppresses missing callbacks',
  async (_name, Widget) => {
    const value = state<string | null>('a')
    const trace: string[] = []
    const replacement: NonNullable<Props['onValueChange']> = function (this: unknown, next) {
      expect(this).toBeUndefined()
      trace.push(`replacement:${next}`)
    }
    const original: typeof replacement = function (this: unknown, next) {
      expect(this).toBeUndefined()
      trace.push(`original:${next}`)
    }
    let callback: Props['onValueChange'] = original
    const props: Props = {
      label: 'Food',
      options,
      value,
    }
    Object.defineProperty(props, 'onValueChange', {
      get(this: unknown) {
        expect(this).toBe(props)
        trace.push('lookup')
        const captured = callback
        if (callback === original) callback = replacement
        return captured
      },
    })
    const { container, unmount } = render(() => Widget(props))
    await tick()
    const trigger = container.querySelector<HTMLButtonElement>('[role=combobox]')!
    key(trigger, 'ArrowDown')
    key(trigger, 'ArrowDown')
    key(trigger, 'Enter')
    await tick()
    expect(trace).toEqual(['lookup', 'original:b'])
    trace.length = 0
    key(trigger, 'End')
    key(trigger, 'Enter')
    await tick()
    expect(trace).toEqual(['lookup', 'replacement:c'])
    callback = undefined
    trace.length = 0
    key(trigger, 'Home')
    key(trigger, 'Enter')
    await tick()
    expect(trace).toEqual(['lookup'])
    expect(value.value).toBe('a')
    unmount()
  },
)

test('two list instances keep separate refs and remove carrier and trigger listeners on unmount', async () => {
  const heard: string[] = []
  const first = render(() => (
    <Select
      label="First"
      options={options}
      onValueChange={(value) => heard.push(`first:${value}`)}
    />
  ))
  const second = render(() => (
    <CompactSelect
      label="Second"
      options={options}
      onValueChange={(value) => heard.push(`second:${value}`)}
    />
  ))
  await tick()
  const one = first.container.querySelector<HTMLButtonElement>('[role=combobox]')!
  const carrier = first.container.querySelector('select')!
  const two = second.container.querySelector<HTMLButtonElement>('[role=combobox]')!
  one.click()
  await tick()
  first.unmount()
  carrier.value = 'c'
  carrier.dispatchEvent(new Event('change', { bubbles: true }))
  key(one, 'ArrowDown')
  key(one, 'Enter')
  await tick()
  expect(heard).toEqual([])
  key(two, 'ArrowDown')
  key(two, 'ArrowDown')
  key(two, 'Enter')
  await tick()
  expect(heard).toEqual(['second:b'])
  expect(second.container.querySelector('[data-part=value]')!.textContent).toBe('Bean')
  second.unmount()
  key(two, 'ArrowDown')
  key(two, 'Enter')
  await tick()
  expect(heard).toEqual(['second:b'])
})
