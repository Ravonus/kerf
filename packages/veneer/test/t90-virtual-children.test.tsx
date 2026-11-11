import { onCleanup, state } from '@kerf/core'
import { fakeMeasure, flush, render } from '@kerf/core/test'
import { VirtualList, type VirtualListProps } from '../src/VirtualList'

type Item = { id: string; kind: string }
type Draw = VirtualListProps<Item>['children']
type Call = { receiver: unknown; item: Item; index: number; node: HTMLElement }

async function settle() {
  for (let i = 0; i < 4; i++) {
    await flush()
    await new Promise((resolve) => {
      setTimeout(resolve)
    })
  }
}

test('virtual rows and measurement probes call the memoized child bare', async () => {
  const items = state<Item[]>([
    { id: 'a', kind: 'first' },
    { id: 'b', kind: 'first' },
  ])
  const calls: Call[] = []
  const cleaned: HTMLElement[] = []
  const draw = (label: string): Draw =>
    function (this: unknown, item, index) {
      const node = document.createElement('span')
      node.textContent = `${label}:${item().id}`
      calls.push({ receiver: this, item: item(), index: index(), node })
      onCleanup(() => cleaned.push(node))
      return node
    }
  const current = state<Draw>(draw('first'))
  let reads = 0
  const props: VirtualListProps<Item> = {
    get items() {
      return items.value
    },
    rowKey: (item) => item.id,
    text: (item) => item.id,
    variant: (item) => item.kind,
    get children() {
      reads++
      return current.value
    },
  }
  const { container, unmount } = render(
    () => VirtualList(props),
    {},
    { slots: { 'text.measure': fakeMeasure() } },
  )
  await settle()
  expect(calls.every((call) => call.receiver === undefined)).toBe(true)
  expect(calls.some((call) => call.node.closest('[data-probe]'))).toBe(true)
  expect(calls.some((call) => call.node.closest('[data-part="row"]:not([data-probe])'))).toBe(true)
  expect(reads).toBe(1)
  expect(
    calls.filter((call) => call.item === items.value[0] && call.index === 0).length,
  ).toBeGreaterThanOrEqual(2)
  expect(calls.some((call) => call.item === items.value[1] && call.index === 1)).toBe(true)
  expect(container.querySelector('[data-part="row"] span')).toBe(calls[0]!.node)
  const previous = calls.length
  current.value = draw('next')
  items.value = [...items.value, { id: 'c', kind: 'second' }]
  await settle()
  expect(reads).toBe(2)
  const added = calls.slice(previous).filter((call) => call.item === items.value[2])
  const row = added.find((call) => call.index === 2)
  const probe = added.find((call) => call.index === 0)
  expect(row?.node.textContent).toBe('next:c')
  expect(probe?.node.textContent).toBe('next:c')
  expect(row?.node.closest('[data-part="row"]:not([data-probe])')).toBeTruthy()
  expect(probe?.node.closest('[data-probe]')).toBeTruthy()
  expect(calls.every((call) => call.receiver === undefined)).toBe(true)
  unmount()
  expect(calls.every((call) => cleaned.includes(call.node))).toBe(true)
})
