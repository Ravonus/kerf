// A tree DataGrid's header sort and its Expand all, over loaded and lazy branches.
import { fireEvent } from '@testing-library/dom'
import { flush, render } from '@weft-js/core/test'
import { DataGrid, type GridColumn, type GridTree } from '../src/DataGrid'

const tick = (ms = 0) => new Promise(r => { setTimeout(r, ms) })
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
    const tree: GridTree<Node_> = { branch: r => !!r.hasChildren, load: r => Promise.resolve([leaf(`${r.id}1`, 1, 0), leaf(`${r.id}2`, 2, 0)]) }
    const { container: c } = render(() => <DataGrid caption="Spend" rows={rows} columns={COLUMNS} tree={tree} exportName={false} />)
    await settle()
    press(header(c, 'deploys').querySelector('button')!)
    press(header(c, 'deploys').querySelector('button')!)
    await settle()
    expect(shown(c)).toEqual(['b', 'a'])
  })

  const lazy = () => {
    const calls: string[] = []
    const held: (() => void)[] = []
    const deep: Record<string, Node_[]> = { a: [{ id: 'a1', deploys: 1, cost: 0, hasChildren: true }, leaf('a2', 1, 0)], b: [leaf('b1', 1, 0)], a1: [leaf('a11', 1, 0)] }
    const tree: GridTree<Node_> = { branch: r => !!r.hasChildren, load: r => new Promise(done => { calls.push(r.id); held.push(() => done(deep[r.id]!)) }) }
    return { calls, held, tree, rows: [{ id: 'a', deploys: 1, cost: 0, hasChildren: true }, { id: 'b', deploys: 1, cost: 0, hasChildren: true }] as Node_[], release: async () => { for (const f of held.splice(0)) f(); await settle() } }
  }

  test('Expand all loads every branch that has not loaded, however deep, and opens it', async () => {
    const t = lazy()
    const { container: c } = render(() => <DataGrid caption="Spend" rows={t.rows} columns={COLUMNS} tree={t.tree} exportName={false} />)
    await settle()
    press(button(c, 'Expand all'))
    await settle()
    expect(t.calls).toEqual(['a', 'b'])
    expect(c.querySelector('tr[data-row="a"]')!.getAttribute('aria-busy')).toBe('true')
    await t.release()
    await t.release()
    expect(t.calls).toEqual(['a', 'b', 'a1'])
    expect(shown(c)).toEqual(['a', 'a1', 'a11', 'a2', 'b', 'b1'])
    press(button(c, 'Collapse all'))
    await settle()
    expect(shown(c)).toEqual(['a', 'b'])
    press(button(c, 'Expand all'))
    await settle()
    expect(t.calls).toHaveLength(3) // what's loaded stays loaded
    expect(shown(c)).toEqual(['a', 'a1', 'a11', 'a2', 'b', 'b1'])
  })

  test('Collapse all during Expand all stops it going deeper', async () => {
    const t = lazy()
    const { container: c } = render(() => <DataGrid caption="Spend" rows={t.rows} columns={COLUMNS} tree={t.tree} exportName={false} />)
    await settle()
    press(button(c, 'Expand all'))
    await settle()
    press(button(c, 'Collapse all'))
    await t.release()
    expect(t.calls).toEqual(['a', 'b'])
    expect(shown(c)).toEqual(['a', 'b'])
  })

  test('a second Expand all during the first joins its loads and still goes deeper', async () => {
    const t = lazy()
    const { container: c } = render(() => <DataGrid caption="Spend" rows={t.rows} columns={COLUMNS} tree={t.tree} exportName={false} />)
    await settle()
    press(button(c, 'Expand all'))
    await settle()
    press(button(c, 'Expand all'))
    await settle()
    expect(t.calls).toEqual(['a', 'b'])
    await t.release()
    await t.release()
    expect(shown(c)).toEqual(['a', 'a1', 'a11', 'a2', 'b', 'b1'])
  })

  test('a branch that fails to load during Expand all stays closed, and the rest open', async () => {
    const rows: Node_[] = [{ id: 'bad', deploys: 1, cost: 0, hasChildren: true }, { id: 'ok', deploys: 1, cost: 0, hasChildren: true }]
    const tree: GridTree<Node_> = { branch: r => !!r.hasChildren, load: r => (r.id === 'bad' ? Promise.reject(new Error('no')) : Promise.resolve([leaf('k', 1, 0)])) }
    const { container: c } = render(() => <DataGrid caption="Spend" rows={rows} columns={COLUMNS} tree={tree} exportName={false} />)
    await settle()
    press(button(c, 'Expand all'))
    await settle()
    expect(shown(c)).toEqual(['bad', 'ok', 'k'])
    expect(c.querySelector('tr[data-row="bad"]')!.getAttribute('aria-expanded')).toBe('false')
    expect(c.textContent).toContain('bad couldn’t load')
  })
})

// The site's "A tree" example: Cost is a money-formatted sum, and its header sorts like the others.
describe('DataGrid tree: the site example', () => {
  test('Cost sorts by what each team rolls up, both ways, and its children with it', async () => {
    const { DataGridTree } = await import('../../../site/src/toolkit/examples/data')
    const { container: c } = render(() => <DataGridTree />)
    await settle()
    const costs = () => [...c.querySelectorAll('tbody tr[data-row]')].map(r => r.querySelector('td:last-child')!.textContent)
    const tops = () => [...c.querySelectorAll('tbody tr[data-row][aria-level="1"]')].map(r => (r as HTMLElement).dataset.row)
    const sort = header(c, 'cost').querySelector('button')!
    expect(tops()).toEqual(['Platform', 'Web', 'Data', 'Mobile'])
    press(sort)
    await settle()
    expect(header(c, 'cost').getAttribute('aria-sort')).toBe('ascending')
    expect(tops()).toEqual(['Mobile', 'Web', 'Platform', 'Data'])
    press(sort)
    await settle()
    expect(header(c, 'cost').getAttribute('aria-sort')).toBe('descending')
    expect(tops()).toEqual(['Data', 'Platform', 'Web', 'Mobile'])
    press(button(c, 'Expand all'))
    await settle()
    const num = (s: string | null) => Number(s!.replace(/[$,]/g, ''))
    const platform = shown(c).slice(shown(c).indexOf('Platform') + 1, shown(c).indexOf('Web'))
    const kids = platform.map(id => num(c.querySelector(`tr[data-row="${id}"] td:last-child`)!.textContent))
    expect(kids).toEqual([...kids].sort((a, b) => b - a))
    expect(costs()[0]).toBe('$3,920')
  })
})
