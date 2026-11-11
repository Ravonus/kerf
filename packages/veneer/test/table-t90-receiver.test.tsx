import { resource } from '@kerf-js/core'
import { flush, render } from '@kerf-js/core/test'
import { Table, type TableProps } from '../src/Table'

test('Table callbacks use the live props receiver', async () => {
  const seen: unknown[] = []
  const props: TableProps<{ id: string }> = {
    caption: 'Items',
    rows: [{ id: 'a' }, { id: 'b' }],
    columns: [{ id: 'id', header: 'Id', sort: true }],
    picker: false,
    onSortChange() {
      seen.push(this)
    },
  }
  const { container } = render(() => Table(props))
  container.querySelector<HTMLButtonElement>('th button')!.click()
  await flush()
  expect(seen).toEqual([props])
  props.onSortChange = function () {
    seen.push(this, 'replacement')
  }
  container.querySelector<HTMLButtonElement>('th button')!.click()
  await flush()
  expect(seen).toEqual([props, props, 'replacement'])
})

test('selection, paging, bulk, details and edits retain the props receiver', async () => {
  const seen: [string, unknown][] = []
  type Row = { id: string; name: string }
  const props: TableProps<Row> = {
    caption: 'Items',
    rows: [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ],
    columns: [{ id: 'name', header: 'Name', edit: true }],
    picker: false,
    selection: true,
    page: { size: 1 },
    bulk() {
      seen.push(['bulk', this])
      return null
    },
    onSelectionChange() {
      seen.push(['selection', this])
    },
    onPageChange() {
      seen.push(['page', this])
    },
    expand() {
      seen.push(['expand', this])
      return 'Details'
    },
    onEdit() {
      seen.push(['edit', this])
    },
  }
  const { container: c } = render(() => Table(props))
  props.onSelectionChange = function () {
    seen.push(['selection', this])
  }
  props.onPageChange = function () {
    seen.push(['page', this])
  }
  props.onEdit = function () {
    seen.push(['edit', this])
  }
  c.querySelector<HTMLInputElement>('tbody input')!.click()
  await flush()
  c.querySelector<HTMLElement>('[data-part=expand]')!.click()
  await flush()
  const cell = c.querySelector<HTMLElement>('td[data-col=name]')!
  cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await flush()
  const editor = cell.querySelector<HTMLInputElement>('[data-part=editor]')!
  editor.value = 'New'
  editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await flush()
  ;[...c.querySelectorAll('button')].find((b) => b.textContent === 'Next')!.click()
  await flush()
  for (const name of ['bulk', 'selection', 'page', 'expand', 'edit']) {
    expect(
      seen.some(([kind, receiver]) => kind === name && receiver === props),
      name,
    ).toBe(true)
    expect(
      seen.filter(([kind]) => kind === name).every(([, receiver]) => receiver === props),
      name,
    ).toBe(true)
  }
})

test('retry retains the props receiver', async () => {
  const receivers: unknown[] = []
  const props: TableProps<{ id: string }> = {
    caption: 'Items',
    rows: [],
    columns: [],
    status: 'error',
    picker: false,
    onRetry() {
      receivers.push(this)
    },
  }
  const { container } = render(() => Table(props))
  props.onRetry = function () {
    receivers.push(this)
  }
  ;[...container.querySelectorAll('button')].find((b) => b.textContent === 'Retry')!.click()
  await flush()
  expect(receivers).toEqual([props])
})

test('remote paging forwards the original receiver and cursor', async () => {
  let props!: TableProps<{ id: string }>
  const cursor = { page: 2 }
  const seen: unknown[] = []
  const { container } = render(() => {
    const rows = resource(() => Promise.resolve({ items: [{ id: 'a' }], next: cursor }))
    props = { caption: 'Items', rows, columns: [{ id: 'id', header: 'Id' }], picker: false }
    return Table(props)
  })
  props.onPageChange = function (value, reason) {
    seen.push(this, value, reason)
  }
  await new Promise((resolve) => {
    setTimeout(resolve)
  })
  await flush()
  ;[...container.querySelectorAll('button')].find((b) => b.textContent === 'Next')!.click()
  expect(seen).toEqual([props, cursor, 'next'])
  expect(seen[1]).toBe(cursor)
})
