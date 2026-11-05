// Original Shell callbacks, live nav props and slot lifetime after extraction.
import { onCleanup, onMount, state } from '@weft-js/core'
import { resetIds } from '@weft-js/warp-core'
import { render, flush } from '@weft-js/core/test'
import { Shell, type ShellProps } from '../src/Shell'
import { sleep as tick } from '../../../scripts/lib/sleep.mjs'

beforeEach(() => resetIds())

test('Shell retains nav keys, slot ownership and live names', async () => {
  const lifetime: string[] = []
  function Page() {
    onMount(() => lifetime.push('mount'))
    onCleanup(() => lifetime.push('cleanup'))
    return <input aria-label="Page" />
  }
  let update!: () => void
  const { container: c, unmount } = render(() => {
    const label = state('First')
    const current = state('a')
    update = () => {
      label.value = 'Second'
      current.value = 'b'
    }
    return (
      <Shell
        navLabel={label.value}
        current={current.value}
        nav={[
          {
            items: [
              { id: 'a', label: 'A', href: '#a' },
              { id: 'b', label: 'B', href: '#b' },
            ],
          },
        ]}
        brand={{ name: 'Home' }}
      >
        <Page />
      </Shell>
    )
  })
  await flush()
  const link = c.querySelector('a[href="#a"]')
  const input = c.querySelector<HTMLInputElement>('input')!
  input.focus()
  update()
  await flush()
  expect(c.querySelector('[data-part="nav"]')?.getAttribute('aria-label')).toBe('Second')
  expect(c.querySelector('a[href="#a"]')).toBe(link)
  expect(c.querySelector('input')).toBe(input)
  expect(document.activeElement).toBe(input)
  expect(c.querySelector('a[aria-current="page"]')?.getAttribute('href')).toBe('#b')
  expect(lifetime).toEqual(['mount'])
  unmount()
  expect(lifetime).toEqual(['mount', 'cleanup'])
})

test('Shell preserves non-on icon calls and live item callbacks', async () => {
  const args: unknown[][] = []
  const receivers: unknown[] = []
  let selected = 0
  const item = {
    id: 'a',
    label: 'A',
    icon(this: unknown, ...value: unknown[]) {
      receivers.push(this)
      args.push(value)
      return <b>Glyph</b>
    },
    onSelect(this: unknown) {
      expect(this).toBe(item)
      selected++
    },
  }
  const { container: c } = render(() => <Shell nav={[{ items: [item] }]} />)
  await flush()
  expect(receivers.length).toBeGreaterThan(0)
  expect(receivers.every((r) => r === undefined)).toBe(true)
  expect(args.every((a) => a.length === 1 && Object.keys(a[0] as object).length === 0)).toBe(true)
  item.onSelect = function (this: unknown) {
    expect(this).toBe(item)
    selected += 10
  }
  c.querySelector<HTMLAnchorElement>('a[data-part="nav-item"]')!.click()
  await flush()
  expect(selected).toBe(10)
})

test('Shell preserves cached workspace keys and captures each callback lookup', async () => {
  const trace: string[] = []
  const initial: NonNullable<ShellProps['switcher']> = {
    current: 'a',
    workspaces: [],
    onSwitch() {},
  }
  let armed = false
  const workspace = {
    get id() {
      if (armed) {
        trace.push('argument')
        armed = false
        initial.onSwitch = function () {
          trace.push('replacement')
        }
      }
      return 'b'
    },
    name: 'Other',
    initials: 'OT',
  }
  initial.workspaces = [workspace]
  let callback = function (this: unknown, value: string) {
    expect(this === initial).toBe(true)
    trace.push('original:' + value)
  }
  Object.defineProperty(initial, 'onSwitch', {
    get() {
      trace.push('lookup')
      const found = callback
      callback = function (this: unknown, value: string) {
        expect(this === initial).toBe(true)
        trace.push('new:' + value)
      }
      return found
    },
  })
  const { container: c } = render(() => (
    <Shell switcher={initial} account={{ name: 'Name', initials: 'NN' }} />
  ))
  await flush()
  const open = c.querySelector<HTMLButtonElement>('[data-part="switcher"]')!
  open.click()
  await tick()
  await flush()
  armed = true
  c.querySelector<HTMLButtonElement>('[role="menuitemradio"]')!.click()
  await flush()
  expect(trace).toEqual(['lookup', 'original:b'])
  c.querySelector<HTMLButtonElement>('[role="menuitemradio"]')!.click()
  await flush()
  expect(trace).toEqual(['lookup', 'original:b', 'lookup', 'new:b'])
})
