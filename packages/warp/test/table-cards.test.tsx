// When a Table is cards: the width that decides it, measured the way the table measures it.
import { flush, render } from '@weft-js/core/test'
import { Table, type Column } from '../src/Table'

const tick = (ms = 0) => new Promise(r => { setTimeout(r, ms) })
const settle = async () => { await tick(); await flush(); await tick(); await flush() }

describe('Table phone cards', () => {
  type P = { id: string; name: string }
  const cols: Column<P>[] = [{ id: 'name', header: 'Name', sort: true }]
  const rows: P[] = [{ id: 'a', name: 'A' }]
  // jsdom lays nothing out, so the table's width is told to it the way a ResizeObserver would
  function sized() {
    const seen: ResizeObserverCallback[] = []
    const was = window.ResizeObserver
    window.ResizeObserver = class { constructor(fn: ResizeObserverCallback) { seen.push(fn) } observe() {} unobserve() {} disconnect() {} }
    onTestFinished(() => { window.ResizeObserver = was })
    return async (root: HTMLElement, w: number) => {
      Object.defineProperty(root, 'clientWidth', { configurable: true, value: w })
      for (const fn of seen) fn([], {} as ResizeObserver)
      await settle()
    }
  }

  test('a 598px stage on a desktop page is a table; a really narrow container is cards', async () => {
    const width = sized()
    const { container: c } = render(() => <Table caption="T" rows={rows} columns={cols} />)
    await settle()
    const root = c.querySelector<HTMLElement>('[data-scope="table"]')!
    expect(root.dataset.phone).toBe('cards') // unmeasured, as the server sends it: a phone never flashes a table
    await width(root, 598)
    expect(root.dataset.phone).toBe('columns')
    expect(root.querySelector('[data-part="sortbar"]')).toBeNull()
    await width(root, 342)
    expect(root.dataset.phone).toBe('cards')
    expect(root.querySelector('[data-part="sortbar"]')).not.toBeNull()
    await width(root, 1000)
    expect(root.dataset.phone).toBe('columns')
  })

  test('phone="columns" stays columns however narrow', async () => {
    const width = sized()
    const { container: c } = render(() => <Table caption="T" rows={rows} columns={cols} phone="columns" />)
    await settle()
    const root = c.querySelector<HTMLElement>('[data-scope="table"]')!
    await width(root, 300)
    expect(root.dataset.phone).toBe('columns')
    expect(root.querySelector('[data-part="sortbar"]')).toBeNull()
  })
})
