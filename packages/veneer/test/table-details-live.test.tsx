// Details keep live caller props, keyed rows and the original focus target.
import { onCleanup, onMount } from '@kerf/core'
import { flush, render } from '@kerf/core/test'
import { Table, type TableProps } from '../src/Table'

test('sheet details keep live props, row identity, focus and cleanup', async () => {
  const seen: unknown[] = []
  let mounted = 0
  let cleaned = 0
  function Detail({ text }: { text: string }) {
    onMount(() => mounted++)
    onCleanup(() => cleaned++)
    return <span>{text}</span>
  }
  const rows = [{ id: 'a' }, { id: 'b' }]
  const props: TableProps<(typeof rows)[number]> = {
    caption: 'Items',
    rows,
    columns: [{ id: 'id', header: 'Id', sort: true }],
    picker: false,
    details: 'sheet',
    expand(row) {
      seen.push(this, row)
      return <Detail text={`First ${row.id}`} />
    },
  }
  const { container, unmount } = render(() => Table(props))
  await flush()
  const root = container.querySelector<HTMLElement>('[data-scope=table]')!
  Object.defineProperty(root, 'clientWidth', { value: 500 })
  const row = root.querySelector<HTMLElement>('tr[data-id=a]')!
  const button = row.querySelector<HTMLButtonElement>('[data-part=expand]')!
  button.click()
  await flush()
  expect(root.querySelector('[data-part=sheet]')?.textContent).toContain('First a')
  expect(seen).toEqual([props, rows[0]])
  expect(seen[0]).toBe(props)
  const close = root.querySelector<HTMLButtonElement>('[data-part=sheet] button')!
  expect(document.activeElement).toBe(close)
  close.click()
  await flush()
  expect(document.activeElement).toBe(button)
  expect([mounted, cleaned]).toEqual([1, 1])
  props.expand = function (item) {
    seen.push(this, item)
    return <Detail text={`Next ${item.id}`} />
  }
  props.details = 'inline'
  root.querySelector<HTMLButtonElement>('th button')!.click()
  await flush()
  expect(root.querySelector('tr[data-id=a]')).toBe(row)
  expect(row.querySelector('[data-part=expand]')).toBe(button)
  button.click()
  await flush()
  expect(root.querySelector('[data-part=sheet]')).toBeNull()
  expect(root.querySelector('[data-part=detail]')?.textContent).toContain('Next a')
  expect(seen).toEqual([props, rows[0], props, rows[0]])
  expect(seen[2]).toBe(props)
  unmount()
  expect([mounted, cleaned]).toEqual([2, 2])
})
