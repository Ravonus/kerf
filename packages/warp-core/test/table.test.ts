// The table's pure helpers, the menu button and the shell's keys, in plain DOM: what a binding other than weft gets.
import {
  checkState,
  compareValues,
  filterRows,
  menu,
  pageSlice,
  rangeOf,
  shell,
  sortRows,
  table,
} from '../src'

const key = (el: Element, k: string, init: KeyboardEventInit = {}) =>
  el.dispatchEvent(
    new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }),
  )

test('sorting: numbers in order, empties last both ways, ties keep their order', () => {
  const rows = [{ n: 'b10' }, { n: '' }, { n: 'b2' }, { n: 'a' }]
  expect(sortRows(rows, (r) => r.n, 'ascending').map((r) => r.n)).toEqual(['a', 'b2', 'b10', ''])
  expect(sortRows(rows, (r) => r.n, 'descending').map((r) => r.n)).toEqual(['b10', 'b2', 'a', ''])
  expect(compareValues(2, 10)).toBeLessThan(0)
  const ties = [
    { k: 1, v: 'x' },
    { k: 1, v: 'y' },
  ]
  expect(sortRows(ties, (r) => r.k, 'descending').map((r) => r.v)).toEqual(['x', 'y'])
})

test('filter, page and range', () => {
  expect(filterRows([{ a: 'Apollo' }, { a: 'Delta' }], ' apo ', (r) => [r.a])).toHaveLength(1)
  expect(filterRows([{ a: 1 }], '', () => [])).toHaveLength(1)
  expect(pageSlice([1, 2, 3, 4, 5], 9, 2)).toMatchObject({
    rows: [5],
    page: 2,
    pages: 3,
    from: 5,
    to: 5,
  })
  expect(pageSlice([], 0, 2)).toMatchObject({ rows: [], from: 0, to: 0, pages: 1 })
  expect(rangeOf(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['b', 'c', 'd'])
  expect(rangeOf(['a'], 'gone', 'a')).toEqual(['a'])
  expect(checkState(['a', 'b'], (k) => k === 'a')).toBe('some')
})

test('the table hides columns with one rule and resizes by key', () => {
  const root = document.body.appendChild(document.createElement('div'))
  root.id = 't1'
  root.innerHTML =
    '<div data-part="viewport"><table><tr><th><span data-part="resize" tabindex="0"></span></th></tr></table></div>'
  const a = table(root, { hidden: ['x'] })
  expect(root.querySelector('style')!.textContent).toBe('#t1 [data-col="x"]{display:none}')
  a.update({ hidden: [] })
  expect(root.querySelector('style')!.textContent).toBe('')
  const handle = root.querySelector('[data-part="resize"]')!
  key(handle, 'ArrowRight')
  expect(handle.getAttribute('aria-valuenow')).toBe('80') // jsdom has no layout: 0 + 16, floored at the minimum
  a.destroy()
  expect(root.querySelector('style')).toBeNull()
  root.remove()
})

function menuFixture() {
  const b = document.body.appendChild(document.createElement('button'))
  const m = document.body.appendChild(document.createElement('div'))
  m.innerHTML = ['Profile', 'Preferences', 'Sign out']
    .map((t) => `<a role="menuitem" tabindex="-1" href="#">${t}</a>`)
    .join('')
  const closed = vi.fn()
  const opts = { open: false, trigger: () => b, onClose: closed }
  const action = menu(m, opts)
  return {
    b,
    m,
    closed,
    opts,
    action,
    done() {
      action.destroy()
      b.remove()
      m.remove()
    },
  }
}

test('menu: opens on the first item, or the last, and arrows wrap', () => {
  const f = menuFixture()
  f.action.update({ ...f.opts, open: true })
  expect(document.activeElement!.textContent).toBe('Profile')
  key(document.activeElement!, 'ArrowUp')
  expect(document.activeElement!.textContent).toBe('Sign out')
  key(document.activeElement!, 'ArrowDown')
  expect(document.activeElement!.textContent).toBe('Profile')
  key(document.activeElement!, 'End')
  expect(document.activeElement!.textContent).toBe('Sign out')
  f.action.update({ ...f.opts, open: false })
  f.action.update({ ...f.opts, open: true, at: 'last' })
  expect(document.activeElement!.textContent).toBe('Sign out')
  f.done()
})

test('menu: typeahead builds a prefix and a repeated letter cycles', () => {
  const f = menuFixture()
  f.action.update({ ...f.opts, open: true })
  key(document.activeElement!, 'p')
  expect(document.activeElement!.textContent).toBe('Preferences')
  key(document.activeElement!, 'p')
  expect(document.activeElement!.textContent).toBe('Profile')
  key(document.activeElement!, 'r')
  expect(document.activeElement!.textContent).toBe('Profile')
  f.done()
})

test('menu: Escape returns to the trigger, Tab closes from it, an outside press leaves focus alone', () => {
  const f = menuFixture()
  f.action.update({ ...f.opts, open: true })
  key(document.activeElement!, 'Escape')
  expect(f.closed).toHaveBeenCalledTimes(1)
  expect(document.activeElement).toBe(f.b)
  f.action.update({ ...f.opts, open: false })
  f.action.update({ ...f.opts, open: true })
  key(document.activeElement!, 'Tab')
  expect(f.closed).toHaveBeenCalledTimes(2)
  expect(document.activeElement).toBe(f.b)
  f.action.update({ ...f.opts, open: false })
  f.action.update({ ...f.opts, open: true })
  const at = document.activeElement
  document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
  expect(f.closed).toHaveBeenCalledTimes(3)
  expect(document.activeElement).toBe(at)
  f.done()
})

test('shell: [ toggles outside a field, ⌘K opens the command, a route change draws the line', () => {
  const root = document.body.appendChild(document.createElement('div'))
  root.innerHTML = '<nav data-part="nav"></nav><input><div data-part="page"><h1>Orders</h1></div>'
  const onToggle = vi.fn(),
    onCommand = vi.fn(),
    onWide = vi.fn()
  const opts = { navOpen: false, current: 'a', onToggle, onCloseNav() {}, onWide, onCommand }
  const a = shell(root, opts)
  expect(onWide).toHaveBeenCalledWith(false)
  key(document.body, '[')
  expect(onToggle).toHaveBeenCalledTimes(1)
  key(root.querySelector('input')!, '[')
  expect(onToggle).toHaveBeenCalledTimes(1)
  key(document.body, 'k', { metaKey: true })
  expect(onCommand).toHaveBeenCalledTimes(1)
  a.update({ ...opts, current: 'b' })
  expect(root.hasAttribute('data-routing')).toBe(true)
  expect(root.querySelector('[data-part="page"]')!.hasAttribute('data-enter')).toBe(true)
  a.destroy()
  root.remove()
})
