// A tree DataGrid's header sort and its Expand all, over loaded and lazy branches.
import { fireEvent } from '@testing-library/dom'
import { flush, render } from 'weft/test'
import { DataGrid, type GridColumn, type GridTree } from '../src/DataGrid'

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms))
const settle = async () => { await tick(); await flush(); await tick(); await flush() }

type Node_ = { id: string; deploys: number; cost: number; kids?: Node_[]; hasChildren?: boolean }
const leaf = (id: string, deploys: number, cost: number): Node_ => ({ id, deploys, cost })
const COLUMNS: GridColumn<Node_>[] = [
  { id: 'id', header: 'Name', sort: true },
  { id: 'deploys', header: 'Deploys', numeric: true, aggregate: 'sum', sort: true },
  { id: 'cost', header: 'Cost', numeric: true, aggregate: 'sum', sort: true },
]
const shown = (c: Element) => [...c.querySelectorAll('tbody tr[data-row]')].map(r => (r as HTMLElement).dataset.row)
const header = (c: Element, id: string) => c.querySelector<HTMLElement>(`thead th[data-col="${id}"]`)!
const press = (el: Element) => fireEvent.click(el)
const button = (c: Element, name: string) => [...c.querySelectorAll('button')].find(b => b.textContent === name)!

describe('DataGrid tree', () => {
  const small: Node_ = { id: 'small', deploys: 0, cost: 0, kids: [leaf('s1', 2, 10), leaf('s2', 1, 20)] }
  const big: Node_ = { id: 'big', deploys: 0, cost: 0, kids: [leaf('b1', 5, 1), leaf('b2', 9, 2)] }

  test('a header sorts branches by what they roll up, and each branch\'s children', async () => {
    const { container: c } = render(() => <DataGrid caption="Spend" rows={[small, big]} columns={COLUMNS} tree={{}} exportName={false} />)
    await settle()
    press(button(c, 'Expand all'))
    await settle()
    expect(shown(c)).toEqual(['small', 's1', 's2', 'big', 'b1', 'b2'])
    press(header(c, 'deploys').querySelector('button')!)
    await settle()
    expect(header(c, 'deploys').getAttribute('aria-sort')).toBe('ascending')
    expect(shown(c)).toEqual(['small', 's2', 's1', 'big', 'b1', 'b2'])
    press(header(c, 'deploys').querySelector('button')!)
    await settle()
    expect(header(c, 'deploys').getAttribute('aria-sort')).toBe('descending')
    expect(shown(c)).toEqual(['big', 'b2', 'b1', 'small', 's1', 's2'])
    expect(c.querySelector('tr[data-row="b2"]')!.getAttribute('aria-posinset')).toBe('1')
  })

  test('a lazy tree sorts what it loaded, and a branch not loaded yet by its own number', async () => {
    const rows: Node_[] = [{ id: 'a', deploys: 1, cost: 0, hasChildren: true }, { id: 'b', deploys: 7, cost: 0, hasChildren: true }]
    const tree: GridTree<Node_> = { branch: r => !!r.hasChildren, load: async r => [leaf(`${r.id}1`, 1, 0), leaf(`${r.id}2`, 2, 0)] }
    const { container: c } = render(() => <DataGrid caption="Spend" rows={rows} columns={COLUMNS} tree={tree} exportName={false} />)
    await settle()
    press(header(c, 'deploys').querySelector('button')!)
    press(header(c, 'deploys').querySelector('button')!)
    await settle()
    expect(shown(c)).toEqual(['b', 'a'])
  })
})
