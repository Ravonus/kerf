// Real Table consumers exercise the private cell's live inputs and keyed lifetime.
import { onCleanup, onMount, state } from '@kerf-js/core'
import { createComponent } from '@kerf-js/core/dom'
import { flush, render } from '@kerf-js/core/test'
import { Table, type TableProps } from '../src/Table'
import { Row } from '../src/Table-rows'
import type { Column, Ctx, TableSort } from '../src/Table-types'

type Item = { id: string; name: string }

function key(target: Element, value: string) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true }))
}

test('editing keeps its keyed cell and reads the current row, column and callback', async () => {
  const rows = state([
    { id: 'a', name: 'Alpha' },
    { id: 'b', name: 'Beta' },
  ])
  const sort = state<TableSort | undefined>(undefined)
  const header = state('Name')
  const prefix = state('')
  const seen: unknown[] = []
  const column: Column<Item> = {
    id: 'name',
    get header() {
      return header.value
    },
    value(row) {
      expect(this).toBe(column)
      return prefix.value + row.name
    },
    edit(text) {
      expect(this).toBe(column)
      return text.toUpperCase()
    },
    validate() {
      expect(this).toBe(column)
      return true
    },
    sort: true,
  }
  const props: TableProps<Item> = {
    caption: 'Items',
    rows,
    sort,
    columns: [column],
    picker: false,
    onEdit() {
      seen.push('old')
    },
  }
  const { container, unmount } = render(() => Table(props))
  await flush()
  const row = container.querySelector('tr[data-id=a]')!
  const cell = row.querySelector<HTMLElement>('td[data-col=name]')!
  key(cell, 'F2')
  await flush()
  const editor = cell.querySelector<HTMLInputElement>('input')!
  expect(document.activeElement).toBe(editor)
  expect(editor.value).toBe('Alpha')
  rows.value = [{ id: 'a', name: 'Updated' }, rows.value[1]!]
  header.value = 'Current name'
  sort.value = { id: 'name', dir: 'descending' }
  props.onEdit = function (item, id, value) {
    seen.push(this, item, id, value)
  }
  await flush()
  expect(container.querySelector('tr[data-id=a]')).toBe(row)
  expect(row.querySelector('td[data-col=name]')).toBe(cell)
  expect(cell.querySelector('input')).toBe(editor)
  expect(document.activeElement).toBe(editor)
  expect(cell.dataset.label).toBe('Current name')
  editor.value = 'edited'
  key(editor, 'Enter')
  await flush()
  expect(seen).toEqual([props, rows.value[0], 'name', 'EDITED'])
  expect(document.activeElement).toBe(cell)
  expect(cell.textContent).toBe('Updated')
  prefix.value = 'Live '
  await flush()
  expect(cell.textContent).toBe('Live Updated')
  unmount()
})

test('custom cells mount once per keyed row and clean up on removal and unmount', async () => {
  const rows = state([
    { id: 'a', name: 'Alpha' },
    { id: 'b', name: 'Beta' },
  ])
  const sort = state<TableSort | undefined>(undefined)
  const mounted: string[] = []
  const cleaned: string[] = []
  function Mark({ text }: { text: string }) {
    onMount(() => mounted.push(text))
    onCleanup(() => cleaned.push(text))
    return <span tabindex="0">{text}</span>
  }
  const column: Column<Item> = {
    id: 'name',
    header: 'Name',
    sort: true,
    cell(row) {
      expect(this).toBe(column)
      return <Mark text={row.name} />
    },
  }
  const { container, unmount } = render(() => (
    <Table caption="Items" rows={rows} sort={sort} columns={[column]} picker={false} />
  ))
  await flush()
  const a = container.querySelector<HTMLElement>('tr[data-id=a] span')!
  const b = container.querySelector<HTMLElement>('tr[data-id=b] span')!
  sort.value = { id: 'name', dir: 'descending' }
  await flush()
  expect(container.querySelector('tr[data-id=a] span')).toBe(a)
  expect(container.querySelector('tr[data-id=b] span')).toBe(b)
  a.focus()
  expect(document.activeElement).toBe(a)
  expect(mounted).toEqual(['Alpha', 'Beta'])
  expect(cleaned).toEqual([])
  rows.value = [rows.value[0]!]
  await flush()
  expect(cleaned).toEqual(['Beta'])
  expect(container.querySelector('tr[data-id=a] span')).toBe(a)
  expect(document.activeElement).toBe(a)
  unmount()
  expect(cleaned).toEqual(['Beta', 'Alpha'])
})

test('column reordering keeps the editor attached to its column key', async () => {
  const columns = state<Column<Item>[]>([
    { id: 'name', header: 'Name', edit: true },
    { id: 'id', header: 'Id', edit: true },
  ])
  const seen: unknown[] = []
  const props: TableProps<Item> = {
    caption: 'Items',
    rows: [{ id: 'a', name: 'Alpha' }],
    picker: false,
    get columns() {
      return columns.value
    },
    onEdit(row, column, value) {
      seen.push(this, row, column, value)
    },
  }
  const { container, unmount } = render(() => Table(props))
  await flush()
  const cell = container.querySelector<HTMLElement>('td[data-col=name]')!
  key(cell, 'F2')
  await flush()
  const editor = cell.querySelector<HTMLInputElement>('input')!
  editor.value = 'Draft'
  columns.value = [columns.value[1]!, columns.value[0]!]
  await flush()
  expect(
    [...container.querySelectorAll('td[data-col]')].map((td) => td.getAttribute('data-col')),
  ).toEqual(['id', 'name'])
  expect(container.querySelector('td[data-col=name]')).toBe(cell)
  expect(cell.querySelector('input')).toBe(editor)
  expect(editor.value).toBe('Draft')
  editor.focus()
  key(editor, 'Enter')
  await flush()
  expect(seen).toEqual([props, (props.rows as Item[])[0], 'name', 'Draft'])
  expect(document.activeElement).toBe(cell)
  unmount()
})

test('cell lookup precedes its row argument and retains the live normal-function receiver', async () => {
  const item = { id: 'a', name: 'Alpha' }
  const version = state(0)
  const trace: unknown[] = []
  let active = false
  let argument = false
  let callback: NonNullable<Column<Item>['cell']> = function (this: unknown, row) {
    if (active) trace.push('original', this === column, row === item)
    return 'Original'
  }
  const replacement: typeof callback = function (this: unknown, row) {
    if (active) trace.push('replacement', this === column, row === item)
    return 'Replacement'
  }
  const column: Column<Item> = {
    id: 'name',
    header: 'Name',
    get cell() {
      void version.value
      if (active) trace.push('lookup')
      return callback
    },
  }
  const ctx: Ctx<Item> = {
    id: 'test',
    level: 2,
    cols: () => [column],
    keyOf: (row) => row.id,
    read: (_column, row) => row.name,
    sel: undefined,
    open: state({}),
    details: false,
    span: () => 1,
    title: (row) => row.name,
    pick() {},
    toggle() {},
    body: () => null,
  }
  const props = {
    get row() {
      if (argument) {
        trace.push('argument')
        argument = false
        callback = replacement
      }
      return item
    },
    ctx,
  }
  const { container, unmount } = render(() => (
    <table>
      <tbody>{createComponent(Row<Item>, props)}</tbody>
    </table>
  ))
  await flush()
  expect(container.innerHTML).toMatchInlineSnapshot(
    `"<table><tbody><tr role="row" data-id="a"><!----><!----><td role="cell" data-col="name" data-label="Name">Original</td><!----></tr></tbody></table>"`,
  )
  active = true
  argument = true
  version.value++
  await flush()
  expect(trace).toEqual(['lookup', 'lookup', 'argument', 'original', true, true])
  expect(container.textContent).toBe('Original')
  trace.length = 0
  version.value++
  await flush()
  expect(trace).toEqual(['lookup', 'lookup', 'replacement', true, true])
  expect(container.textContent).toBe('Replacement')
  unmount()
})
