// The table and shell driven as a user would: the cases budget.test.tsx doesn't reach.
import { fireEvent } from '@testing-library/dom'
import { resource, state } from 'weft'
import { flush, render } from 'weft/test'
import { Shell } from '../src/Shell'
import { Table, type Column } from '../src/Table'

type P = { id: string; name: string; budget: number }
const rows: P[] = [{ id: 'a', name: 'Apollo', budget: 3 }, { id: 'b', name: 'Borealis', budget: 1 }, { id: 'c', name: 'Cirrus', budget: 2 }]
const columns: Column<P>[] = [{ id: 'name', header: 'Project', rowHeader: true, sort: true }, { id: 'budget', header: 'Budget', numeric: true, sort: true }]
const names = (r: HTMLElement) => [...r.querySelectorAll('tbody td[data-col="name"]')].map(t => t.textContent)
const box = (r: HTMLElement) => r.querySelector<HTMLElement>('[data-scope="table"]')!

test('a header press sorts, and a second reverses; row nodes move, they are not rebuilt', async () => {
  const { container: c } = render(() => <Table caption="P" rows={rows} columns={columns} picker={false} />)
  const first = c.querySelector('tr[data-id="a"]')
  const by = c.querySelector<HTMLElement>('th[data-col="budget"] button')!
  by.click(); await flush()
  expect(names(c)).toEqual(['Borealis', 'Cirrus', 'Apollo'])
  by.click(); await flush()
  expect(names(c)).toEqual(['Apollo', 'Cirrus', 'Borealis'])
  expect(c.querySelector('th[data-col="budget"]')!.getAttribute('aria-sort')).toBe('descending')
  expect(c.querySelector('tr[data-id="a"]')).toBe(first)
})

test('paging, and a filter goes back to page one', async () => {
  const { container: c } = render(() => <Table caption="P" rows={rows} columns={columns} filter="Filter" page={{ size: 2 }} picker={false} />)
  const button = (n: string) => [...c.querySelectorAll('button')].find(b => b.textContent === n)!
  expect(c.querySelector('[data-part="footer"] span')!.textContent).toBe('1–2 of 3')
  expect(button('Previous').disabled).toBe(true)
  button('Next').click(); await flush()
  expect(names(c)).toEqual(['Cirrus'])
  const input = c.querySelector<HTMLInputElement>('input[data-part="input"]')!
  input.value = 'o'; fireEvent.input(input); await flush()
  expect(c.querySelector('[data-part="footer"] span')!.textContent).toBe('1–2 of 2')
})

test('Shift-click selects a range, the header goes mixed then all, Clear empties', async () => {
  const seen: string[][] = []
  const { container: c } = render(() => <Table caption="P" rows={rows} columns={columns} selection onSelectionChange={k => seen.push(k)} picker={false} />)
  const boxes = () => [...c.querySelectorAll<HTMLInputElement>('tbody input')]
  boxes()[0].click(); await flush()
  fireEvent.click(boxes()[1], { shiftKey: true }); await flush()
  expect(seen.at(-1)).toEqual(['a', 'b'])
  const all = c.querySelector<HTMLInputElement>('thead input')!
  expect(all.indeterminate).toBe(true)
  all.click(); await flush()
  expect(seen.at(-1)).toEqual(['a', 'b', 'c'])
  expect(all.indeterminate).toBe(false)
  ;[...c.querySelectorAll<HTMLElement>('[data-part="bulk"] button')].at(-1)!.click(); await flush()
  expect(seen.at(-1)).toEqual([])
  expect(c.querySelector<HTMLElement>('[data-part="bulk"]')!.hidden).toBe(true)
})

test('inline edit: Enter opens, invalid stays, Enter commits, Escape cancels, focus returns', async () => {
  const edits: any[] = []
  const cols: Column<P>[] = [columns[0], { id: 'budget', header: 'Budget', edit: t => Number(t), validate: v => v > 0 || 'Above zero' }]
  const { container: c } = render(() => <Table caption="P" rows={rows} columns={cols} onEdit={(r, col, v) => edits.push([r.id, col, v])} picker={false} />)
  const td = c.querySelector<HTMLElement>('tr[data-id="a"] td[data-col="budget"]')!
  td.focus()
  fireEvent.keyDown(td, { key: 'Enter' }); await flush()
  const input = () => td.querySelector<HTMLInputElement>('[data-part="editor"]')!
  expect(document.activeElement).toBe(input())
  input().value = '-1'
  fireEvent.keyDown(input(), { key: 'Enter' }); await flush()
  expect(edits).toEqual([])
  expect(td.hasAttribute('data-invalid')).toBe(true)
  expect(td.querySelector('[role="alert"]')!.textContent).toBe('Above zero')
  input().value = '9'
  fireEvent.keyDown(input(), { key: 'Enter' }); await flush()
  expect(edits).toEqual([['a', 'budget', 9]])
  expect(document.activeElement).toBe(td)
  fireEvent.keyDown(td, { key: 'F2' }); await flush()
  fireEvent.keyDown(input(), { key: 'Escape' }); await flush()
  expect(edits).toHaveLength(1)
  expect(td.querySelector('input')).toBeNull()
})

test('details slide open in place at any width, and leave once closed', async () => {
  const { container: c } = render(() => <Table caption="P" rows={rows} columns={columns} expand={r => <p>About {r.name}</p>} picker={false} />)
  const expand = c.querySelector<HTMLElement>('tr[data-id="a"] [data-part="expand"]')!
  expand.click(); await flush() // jsdom has no layout: clientWidth 0, as narrow as a phone
  expect(c.querySelector('[data-part="sheet"]')).toBeNull()
  expect(expand.getAttribute('aria-expanded')).toBe('true')
  expect(c.querySelector(`#${expand.getAttribute('aria-controls')} [data-part="slide"]`)!.textContent).toContain('About Apollo')
  const sheet = document.head.appendChild(Object.assign(document.createElement('style'), { textContent: '[data-part="slide"] { transition-duration: .03s }' }))
  expand.click(); await flush(); await Promise.resolve()
  expect(expand.getAttribute('aria-expanded')).toBe('false')
  expect(c.querySelector('[data-part="slide"]')!.hasAttribute('data-closing')).toBe(true) // still sliding shut
  await new Promise(done => setTimeout(done, 60)) // transitionend never fires here, as when a transition is skipped
  sheet.remove()
  expect(c.querySelector('tr[data-part="detail"]')).toBeNull()
})

test('details="sheet": in place when wide, in a sheet when narrow, Escape returns focus', async () => {
  const { container: c } = render(() => <Table caption="P" rows={rows} columns={columns} details="sheet" expand={r => <p>About {r.name}</p>} picker={false} />)
  const expand = c.querySelector<HTMLElement>('tr[data-id="a"] [data-part="expand"]')!
  // jsdom has no layout, so clientWidth 0 reads as narrow
  expand.click(); await flush()
  const sheet = c.querySelector<HTMLElement>('[data-part="sheet"]')!
  expect(sheet.textContent).toContain('About Apollo')
  expect(document.activeElement!.textContent).toBe('Close')
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' }); await flush()
  expect(c.querySelector('[data-part="sheet"]')).toBeNull()
  expect(document.activeElement).toBe(expand)
  Object.defineProperty(box(c), 'clientWidth', { value: 1200 })
  expand.click(); await flush()
  expect(expand.getAttribute('aria-expanded')).toBe('true')
  expect(c.querySelector(`#${expand.getAttribute('aria-controls')}`)!.textContent).toContain('About Apollo')
})

test('states keep the frame: loading, empty and error with Retry', async () => {
  const status = state<'loading' | 'error' | undefined>('loading')
  const retry = vi.fn()
  const { container: c } = render(() => <Table caption="P" rows={[]} columns={columns} status={status.value} onRetry={retry} picker={false} />)
  expect(box(c).dataset.state).toBe('loading')
  expect(c.querySelector('tbody')!.getAttribute('aria-busy')).toBe('true')
  status.value = undefined; await flush()
  expect(c.querySelector('[role="status"] h4')!.textContent).toBe('Nothing here yet')
  status.value = 'error'; await flush()
  expect(c.querySelector('[role="alert"]')).not.toBeNull()
  c.querySelector<HTMLElement>('[data-part="state"] button')!.click()
  expect(retry).toHaveBeenCalled()
})

test('a Resource of a list page: loading, then its rows and cursors, untouched by the client', async () => {
  const pages: unknown[] = []
  const { container: c } = render(() => {
    const list = resource(async () => ({ items: rows, total: 30, next: 'c2' }))
    return <Table caption="P" rows={list} columns={columns} onPageChange={to => pages.push(to)} picker={false} />
  })
  expect(box(c).dataset.state).toBe('loading')
  await new Promise(r => setTimeout(r)); await flush()
  expect(names(c)).toEqual(['Apollo', 'Borealis', 'Cirrus'])
  expect(c.querySelector('[data-part="footer"] span')!.textContent).toBe('3 of 30')
  ;[...c.querySelectorAll('button')].find(b => b.textContent === 'Next')!.click()
  expect(pages).toEqual(['c2'])
})

test('a closed table holds no Columns panel, and a wide one no phone sort bar', async () => {
  const { container: c } = render(() => <Table caption="P" rows={rows} columns={columns} />)
  await flush()
  const open = [...c.querySelectorAll('button')].find(b => b.textContent === 'Columns')!
  expect(c.querySelector('[popover]')).toBeNull()
  expect(open.hasAttribute('aria-controls')).toBe(false)
  expect(c.querySelector('[data-part="sortbar"]')).toBeNull()
  open.click()
  await flush()
  expect(c.querySelector('[popover]')).not.toBeNull()
  expect(open.getAttribute('aria-controls')).toBe(c.querySelector('[popover]')!.id)
})

test('Columns: a disclosure of checkboxes hides a column by stylesheet, without touching rows', async () => {
  const { container: c } = render(() => <Table caption="P" rows={rows} columns={columns} />)
  await flush(); await Promise.resolve()
  const open = [...c.querySelectorAll('button')].find(b => b.textContent === 'Columns')!
  expect(open.getAttribute('aria-haspopup')).toBeNull()
  open.click(); await flush()
  expect(open.getAttribute('aria-expanded')).toBe('true')
  c.querySelectorAll<HTMLElement>('[role="group"] input')[1].click(); await flush()
  expect(c.querySelector('style')!.textContent).toContain('[data-col="budget"]{display:none}')
  // a mouse press on a label sends focus to the nearest focusable ancestor, such as the shell's <main tabindex="-1">
  fireEvent.focusOut(c.querySelector('[role="group"] input')!, { relatedTarget: c })
  await flush()
  expect(open.getAttribute('aria-expanded')).toBe('true')
  fireEvent.focusOut(c.querySelector('[role="group"] input')!, { relatedTarget: document.body.appendChild(document.createElement('button')) })
  await flush()
  expect(open.getAttribute('aria-expanded')).toBe('false')
})

const nav = [{ label: 'Workspace', items: ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, label: id.toUpperCase(), href: `#${id}` })) }, { label: 'Views', items: [{ id: 'v', label: 'V', href: '#v' }] }]

test('the shell: skip link first, tabs and More, one current item, one main', async () => {
  const { container: c } = render(() => <Shell nav={nav} current="b" brand={{ name: 'Loom' }}><h1>B</h1></Shell>)
  expect(c.querySelector('[data-scope="shell"]')!.firstElementChild!.getAttribute('data-part')).toBe('skip')
  expect(c.querySelector('[data-part="skip"]')!.getAttribute('href')).toBe(`#${c.querySelector('main')!.id}`)
  expect(c.querySelectorAll('li[data-tab]')).toHaveLength(5) // four tabs + More
  expect(c.querySelector('[aria-current="page"]')!.textContent).toContain('B')
  c.querySelector<HTMLElement>('[data-part="nav-more"] button')!.click(); await flush()
  const sheet = c.querySelector<HTMLElement>('[data-part="sheet"]')!
  expect(sheet.hidden).toBe(false)
  expect(sheet.textContent).toContain('E')
  expect(sheet.textContent).toContain('V')
})

test('the toggle: a narrow shell opens the overlay and the scrim closes it; a collapsed box writes through', async () => {
  const collapsed = state<boolean | 'hidden'>(true)
  const { container: c } = render(() => <Shell nav={nav} collapsed={collapsed}><h1>B</h1></Shell>)
  const root = c.querySelector<HTMLElement>('[data-scope="shell"]')!
  expect(root.getAttribute('data-collapsed')).toBe('')
  c.querySelector<HTMLElement>('[data-part="nav-toggle"]')!.click(); await flush()
  expect(root.hasAttribute('data-nav-open')).toBe(true)
  expect(c.querySelector<HTMLElement>('[data-part="scrim"]')!.hidden).toBe(false)
  c.querySelector<HTMLElement>('[data-part="scrim"]')!.click(); await flush()
  expect(root.hasAttribute('data-nav-open')).toBe(false)
  collapsed.value = 'hidden'; await flush()
  expect(root.getAttribute('data-collapsed')).toBe('hidden')
  expect(c.querySelector('[data-part="edge-tab"]')).not.toBeNull()
})

test('the focus variant has no nav, and an island names a region instead of main', () => {
  const { container: c } = render(() => <Shell variant="focus" title="Setup" step="Step 2 of 4" close={{ label: 'Close setup' }} island label="Setup"><h1>Pay</h1></Shell>)
  expect(c.querySelector('[data-part="nav"]')).toBeNull()
  expect(c.querySelector('main')).toBeNull()
  expect(c.querySelector('[role="region"]')!.getAttribute('aria-label')).toBe('Setup')
  expect(c.textContent).toContain('Step 2 of 4')
  expect(c.querySelector('[aria-label="Close setup"]')).not.toBeNull()
})
