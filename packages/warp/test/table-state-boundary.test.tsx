// The setup/render boundary preserves keyed nodes, comment markers and live callback evaluation.
import { resource, state } from '@weft-js/core'
import { flush, render } from '@weft-js/core/test'
import { Table, type TableProps, type ListPage } from '../src/Table'

function comments(root: Element) {
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT)
  const nodes: Node[] = []
  while (walk.nextNode()) nodes.push(walk.currentNode)
  return nodes
}

test('row replacement and sorting keep keyed cells, focus and every marker', async () => {
  const rows = state([
    { id: 'a', name: 'Alpha' },
    { id: 'b', name: 'Beta' },
  ])
  const sort = state<{ id: string; dir: 'ascending' | 'descending' } | undefined>(undefined)
  const { container, unmount } = render(() => (
    <Table
      caption="Items"
      rows={rows}
      sort={sort}
      selection
      picker={false}
      columns={[{ id: 'name', header: 'Name', sort: true }]}
    />
  ))
  await flush()
  const first = container.querySelector<HTMLElement>('tr[data-id=a]')!
  const cell = first.querySelector('td[data-col=name]')!
  const checkbox = first.querySelector<HTMLInputElement>('input')!
  const markers = comments(container)
  checkbox.focus()
  rows.value = [{ id: 'a', name: 'Updated' }, rows.value[1]!]
  await flush()
  expect(container.querySelector('tr[data-id=a]')).toBe(first)
  expect(first.querySelector('td[data-col=name]')).toBe(cell)
  expect(cell.textContent).toBe('Updated')
  expect(document.activeElement).toBe(checkbox)
  sort.value = { id: 'name', dir: 'descending' }
  await flush()
  expect(container.querySelector('tr[data-id=a]')).toBe(first)
  const current = comments(container)
  expect(current).toHaveLength(markers.length)
  expect(current.every((node) => markers.includes(node))).toBe(true)
  expect(document.activeElement).toBe(checkbox)
  unmount()
  expect(container.querySelector('[data-scope=table]')).toBeNull()
})

test('bulk lookup captures its callback before computing keys and keeps the live receiver', async () => {
  const trace: unknown[] = []
  let argument = false
  type Item = { id: string }
  let callback: NonNullable<TableProps<Item>['bulk']> = function (this: unknown, keys) {
    trace.push('original', this, keys)
    return 'Original action'
  }
  const replacement: typeof callback = function (this: unknown, keys) {
    trace.push('replacement', this, keys)
    return 'Replacement action'
  }
  const selected = state<Record<string, boolean>>(
    new Proxy(
      { a: true },
      {
        ownKeys(target) {
          if (argument) {
            argument = false
            trace.push('argument')
            callback = replacement
          }
          return Reflect.ownKeys(target)
        },
      },
    ),
  )
  const props: TableProps<Item> = {
    caption: 'Items',
    rows: [{ id: 'a' }, { id: 'b' }],
    columns: [{ id: 'id', header: 'Id' }],
    picker: false,
    selection: selected,
    get bulk() {
      trace.push('lookup')
      argument = true
      return callback
    },
  }
  const { container } = render(() => Table(props))
  await flush()
  expect(trace.slice(0, 5)).toEqual(['lookup', 'argument', 'original', props, ['a']])
  expect(container.textContent).toContain('Original action')
  trace.length = 0
  selected.value = { b: true }
  await flush()
  expect(trace).toContain('replacement')
  expect(trace).toContain(props)
  expect(container.textContent).toContain('Replacement action')
})

test('selection works with no bulk callback and Clear still writes the shared selection', async () => {
  const selected = state<Record<string, boolean>>({ a: true })
  const { container } = render(() => (
    <Table
      caption="Items"
      rows={[{ id: 'a' }]}
      selection={selected}
      picker={false}
      columns={[{ id: 'id', header: 'Id' }]}
    />
  ))
  await flush()
  expect(container.querySelector('[data-part=bulk]')!.textContent).toContain('1 selected')
  container.querySelector<HTMLButtonElement>('[data-part=bulk] button')!.click()
  await flush()
  expect(selected.value).toEqual({})
  expect(container.querySelector<HTMLElement>('[data-part=bulk]')!.hidden).toBe(true)
})

test('local paging keeps full row counts and selects only the visible page', async () => {
  const selected = state<Record<string, boolean>>({})
  const { container } = render(() => (
    <Table
      caption="Pages"
      rows={[{ id: 'a' }, { id: 'b' }, { id: 'c' }]}
      columns={[{ id: 'id', header: 'Id' }]}
      selection={selected}
      page={{ size: 1 }}
      picker={false}
    />
  ))
  await flush()
  const table = container.querySelector('table')!
  const check = container.querySelector<HTMLInputElement>('thead input')!
  const next = [...container.querySelectorAll('button')].find(
    (button) => button.textContent === 'Next',
  )!
  const prev = [...container.querySelectorAll('button')].find(
    (button) => button.textContent === 'Previous',
  )!
  expect(table.getAttribute('aria-rowcount')).toBe('4')
  expect(prev.disabled).toBe(true)
  expect(next.disabled).toBe(false)
  check.click()
  await flush()
  expect(selected.value).toEqual({ a: true })
  next.click()
  await flush()
  expect(container.querySelector('tbody tr')!.getAttribute('data-id')).toBe('b')
  expect(container.querySelector('[data-part=footer]')!.textContent).toContain('2–2 of 3')
  expect(check.checked).toBe(false)
  check.click()
  await flush()
  expect(selected.value).toEqual({ a: true, b: true })
  next.click()
  await flush()
  expect(next.disabled).toBe(true)
  expect(prev.disabled).toBe(false)
  expect(table.getAttribute('aria-rowcount')).toBe('4')
})

test('remote paging captures the live callback before its cursor and skips absent calls', async () => {
  type Item = { id: string }
  const trace: unknown[] = []
  let argument = false,
    cursorReads = 0
  let callback: TableProps<Item>['onPageChange'] = function (this: unknown, cursor, reason) {
    trace.push('original', this, cursor, reason)
  }
  const replacement: typeof callback = function (this: unknown, cursor, reason) {
    trace.push('replacement', this, cursor, reason)
  }
  const page: ListPage<Item> = {
    items: [{ id: 'a' }],
    total: 20,
    get next() {
      expect(this).toBe(page)
      cursorReads++
      if (argument) {
        argument = false
        trace.push('argument')
        callback = replacement
      }
      return 'cursor-a'
    },
  }
  let props!: TableProps<Item>
  const { container } = render(() => {
    const rows = resource(() => Promise.resolve(page))
    props = {
      caption: 'Remote',
      rows,
      columns: [{ id: 'id', header: 'Id' }],
      picker: false,
      get onPageChange() {
        trace.push('lookup')
        argument = callback !== undefined
        return callback
      },
    }
    return Table(props)
  })
  await new Promise((resolve) => {
    setTimeout(resolve)
  })
  await flush()
  const next = [...container.querySelectorAll('button')].find(
    (button) => button.textContent === 'Next',
  )!
  next.click()
  expect(trace).toEqual(['lookup', 'argument', 'original', props, 'cursor-a', 'next'])
  trace.length = 0
  next.click()
  expect(trace).toEqual(['lookup', 'argument', 'replacement', props, 'cursor-a', 'next'])
  callback = undefined
  trace.length = 0
  const before = cursorReads
  next.click()
  expect(trace).toEqual(['lookup'])
  expect(cursorReads).toBe(before)
})
