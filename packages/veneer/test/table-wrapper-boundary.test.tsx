// Public adapters and ordinary Table consumers retain live inputs and callback semantics.
import { onCleanup, onMount, state } from '@kerf/core'
import { flush, render } from '@kerf/core/test'
import { Editor, Table, type TableProps } from '../src/Table'
import { Fields, Sheet } from '../src/Table-rows'
import type { Column, Ctx } from '../src/Table-types'

type Item = { id: string; name: string }

function context(cols: () => Column<Item>[]): Ctx<Item> {
  const ctx: Ctx<Item> = {
    id: 'detail',
    level: 2,
    cols,
    keyOf: (row) => row.id,
    read(column, row) {
      expect(this).toBe(ctx)
      return row[column.id as keyof Item]
    },
    sel: undefined,
    open: state({}),
    details: true,
    span: () => 2,
    title: (row) => row.name,
    pick() {},
    toggle() {},
    body: (row) => row.name,
  }
  return ctx
}

test('Fields keeps keyed columns and live rows with an unbound custom cell', async () => {
  const row = state({ id: 'a', name: 'Alpha' })
  const header = state('Name')
  const receiver: unknown[] = []
  const columns = state<Column<Item>[]>([
    {
      id: 'name',
      get header() {
        return header.value
      },
    },
    {
      id: 'id',
      header: 'Id',
      cell(this: unknown, item) {
        receiver.push(this)
        return item.id
      },
    },
  ])
  const ctx = context(() => columns.value)
  const props = {
    get row() {
      return row.value
    },
    ctx,
  }
  const { container, unmount } = render(() => Fields(props))
  await flush()
  const fields = [...container.querySelectorAll('dl > div')]
  expect(fields.map((field) => field.textContent)).toEqual(['NameAlpha', 'Ida'])
  row.value = { id: 'b', name: 'Beta' }
  header.value = 'Current name'
  await flush()
  expect([...container.querySelectorAll('dl > div')]).toEqual(fields)
  expect(fields.map((field) => field.textContent)).toEqual(['Current nameBeta', 'Idb'])
  columns.value = [columns.value[1]!, columns.value[0]!]
  await flush()
  const moved = [...container.querySelectorAll('dl > div')]
  expect(moved[0]).toBe(fields[1])
  expect(moved[1]).toBe(fields[0])
  expect(receiver.length).toBeGreaterThan(0)
  expect(receiver.every((value) => value === undefined)).toBe(true)
  unmount()
})

test('Editor keeps live labels, values and accessibility state with its mount focus', async () => {
  const label = state('Name')
  const start = state('Alpha')
  const invalid = state(false)
  const description = state<string | undefined>(undefined)
  const props: Parameters<typeof Editor>[0] = {
    get label() {
      return label.value
    },
    get start() {
      return start.value
    },
    get invalid() {
      return invalid.value
    },
    get describedby() {
      return description.value
    },
    onDone() {},
  }
  const { container, unmount } = render(() => Editor(props))
  await flush()
  const input = container.querySelector('input')!
  expect(document.activeElement).toBe(input)
  expect([input.selectionStart, input.selectionEnd]).toEqual([0, 5])
  label.value = 'Current name'
  start.value = 'Beta'
  invalid.value = true
  description.value = 'problem'
  await flush()
  expect(container.querySelector('input')).toBe(input)
  expect(container.textContent).toBe('Current name')
  expect(input.value).toBe('Beta')
  expect(input.getAttribute('aria-invalid')).toBe('true')
  expect(input.getAttribute('aria-describedby')).toBe('problem')
  expect(document.activeElement).toBe(input)
  unmount()
})

test('a validation error keeps the current editor and its unsaved draft', async () => {
  const column: Column<Item> = {
    id: 'name',
    header: 'Name',
    edit: true,
    validate: () => 'Try again',
  }
  const item = { id: 'a', name: 'Alpha' }
  const seen: unknown[] = []
  const props: TableProps<Item> = {
    caption: 'Items',
    rows: [item],
    columns: [column],
    picker: false,
    onEdit(row, id, value) {
      seen.push(this, row, id, value)
    },
  }
  const { container, unmount } = render(() => Table(props))
  await flush()
  const cell = container.querySelector<HTMLElement>('td[data-col=name]')!
  cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true }))
  await flush()
  const editor = cell.querySelector<HTMLInputElement>('input')!
  editor.value = 'Draft'
  editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await flush()
  expect(cell.querySelector('[role=alert]')!.textContent).toBe('Try again')
  expect(cell.querySelector('input')).toBe(editor)
  expect(editor.value).toBe('Draft')
  expect(document.activeElement).toBe(editor)
  expect(seen).toEqual([])
  column.validate = function () {
    expect(this).toBe(column)
    return true
  }
  editor.value = 'Saved'
  editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await flush()
  expect(seen).toEqual([props, item, 'name', 'Saved'])
  expect(cell.querySelector('input')).toBeNull()
  expect(document.activeElement).toBe(cell)
  unmount()
})

test('Editor captures callbacks before the input value and preserves key and blur receivers', async () => {
  const trace: unknown[] = []
  let argument = false
  let callback = function (this: unknown, save: boolean, text: string) {
    trace.push('original', this === props, save, text)
  }
  const replacement: typeof callback = function (this: unknown, save, text) {
    trace.push('replacement', this === props, save, text)
  }
  const props: Parameters<typeof Editor>[0] = {
    label: 'Name',
    start: 'Alpha',
    get onDone() {
      trace.push('lookup')
      return callback
    },
  }
  const { container, unmount } = render(() => Editor(props))
  await flush()
  const input = container.querySelector('input')!
  const value = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!
  Object.defineProperty(input, 'value', {
    configurable: true,
    get() {
      if (argument) {
        argument = false
        trace.push('argument')
        callback = replacement
      }
      return value.get!.call(input)
    },
  })
  trace.length = 0
  argument = true
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  expect(trace).toEqual(['lookup', 'argument', 'original', true, true, 'Alpha'])
  trace.length = 0
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  expect(trace).toEqual(['lookup', 'replacement', true, false, 'Alpha'])
  trace.length = 0
  input.dispatchEvent(new FocusEvent('blur'))
  expect(trace).toEqual(['lookup', 'replacement', false, true, 'Alpha'])
  trace.length = 0
  props.onLeave = function (save, text) {
    trace.push(this === undefined, save, text)
  }
  input.dispatchEvent(new FocusEvent('blur'))
  expect(trace).toEqual([true, true, 'Alpha'])
  unmount()
})

test('Sheet keeps live row/context and callback receivers and removes its layer on unmount', async () => {
  const row = state({ id: 'a', name: 'Alpha' })
  const ctx = state(context(() => []))
  const seen: unknown[] = []
  const props = {
    get row() {
      return row.value
    },
    get ctx() {
      return ctx.value
    },
    onClose(restore?: boolean) {
      seen.push('old', this === props, restore)
    },
  }
  const { container, unmount } = render(() => Sheet(props))
  await flush()
  const sheet = container.querySelector('[role=dialog]')!
  const close = sheet.querySelector<HTMLButtonElement>('button')!
  expect(document.activeElement).toBe(close)
  row.value = { id: 'b', name: 'Beta' }
  ctx.value = { ...ctx.value, level: 3 }
  props.onClose = function (restore) {
    seen.push('new', this === props, restore)
  }
  await flush()
  expect(container.querySelector('[role=dialog]')).toBe(sheet)
  expect(sheet.querySelector('h4')!.textContent).toBe('Beta')
  expect(sheet.querySelector('h4')!.getAttribute('aria-level')).toBe('3')
  expect(sheet.querySelector('[role=group]')!.textContent).toBe('Beta')
  expect(document.activeElement).toBe(close)
  close.click()
  expect(seen).toEqual(['new', true, true])
  seen.length = 0
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  expect(seen).toEqual(['new', true, true])
  unmount()
  seen.length = 0
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  expect(seen).toEqual([])
})

test('open details replace live slots and fall back to Fields under the same sheet', async () => {
  const version = state(0)
  const seen: unknown[] = []
  let mounted = 0
  let cleaned = 0
  function Detail({ text }: { text: string }) {
    onMount(() => mounted++)
    onCleanup(() => cleaned++)
    return <span>{text}</span>
  }
  let callback: TableProps<Item>['expand'] = function (this: unknown, row) {
    seen.push(this)
    return <Detail text={`Old ${row.name}`} />
  }
  const props: TableProps<Item> = {
    caption: 'Items',
    rows: [{ id: 'a', name: 'Alpha' }],
    columns: [{ id: 'name', header: 'Name' }],
    picker: false,
    details: 'sheet',
    get expand() {
      void version.value
      return callback
    },
  }
  const { container, unmount } = render(() => Table(props))
  await flush()
  const root = container.querySelector('[data-scope=table]')!
  Object.defineProperty(root, 'clientWidth', { value: 500 })
  root.querySelector<HTMLButtonElement>('[data-part=expand]')!.click()
  await flush()
  const sheet = root.querySelector('[data-part=sheet]')!
  const close = sheet.querySelector('button')!
  expect(sheet.textContent).toContain('Old Alpha')
  expect([mounted, cleaned]).toEqual([1, 0])
  callback = function (this: unknown, row) {
    seen.push(this)
    return <Detail text={`New ${row.name}`} />
  }
  version.value++
  await flush()
  expect(root.querySelector('[data-part=sheet]')).toBe(sheet)
  expect(sheet.textContent).toContain('New Alpha')
  expect([mounted, cleaned]).toEqual([2, 1])
  expect(document.activeElement).toBe(close)
  callback = undefined
  version.value++
  await flush()
  expect(sheet.querySelector('dl')!.textContent).toBe('NameAlpha')
  expect([mounted, cleaned]).toEqual([2, 2])
  expect(document.activeElement).toBe(close)
  expect(seen).toEqual([props, props])
  unmount()
  expect([mounted, cleaned]).toEqual([2, 2])
})
