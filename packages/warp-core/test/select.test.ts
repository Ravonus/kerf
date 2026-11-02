// selectMenu: the real <select> stays the control; on fine pointers warp's list replaces the OS popup.
import { selectMenu } from '../src/select'

const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
const down = (el: Element) => { const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true }); el.dispatchEvent(e); return e }
const list = (c: Element) => c.querySelector('[role="listbox"]')
const was = Object.getOwnPropertyDescriptor(window, 'matchMedia')

function mount(fine = true) {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: fine }) })
  const c = document.body.appendChild(document.createElement('div'))
  c.innerHTML = '<div data-part="control"><select><option value="a">Apple</option><option value="b" disabled>Bean</option><option value="c">Corn</option></select></div>'
  const sel = c.querySelector('select')!
  const changes: string[] = []
  sel.addEventListener('change', () => changes.push(sel.value))
  return { c, sel, changes, m: selectMenu(sel) }
}
afterEach(() => {
  document.body.innerHTML = ''
  if (was) Object.defineProperty(window, 'matchMedia', was); else delete (window as { matchMedia?: unknown }).matchMedia
})

test('a coarse pointer keeps the OS popup', () => {
  const { c, sel } = mount(false)
  expect(down(sel).defaultPrevented).toBe(false)
  expect(list(c)).toBeNull()
})

test('a press cancels the OS popup and opens the list on the current option', () => {
  const { c, sel } = mount()
  expect(down(sel).defaultPrevented).toBe(true)
  expect(sel.getAttribute('aria-expanded')).toBe('true')
  expect(sel.getAttribute('aria-controls')).toBe(list(c)!.id)
  expect(sel.getAttribute('aria-activedescendant')).toBe(list(c)!.querySelector('[aria-selected="true"]')!.id)
})

test('arrows skip disabled options; Enter commits and fires change once', () => {
  const { sel, changes } = mount()
  key(sel, 'ArrowDown')
  key(sel, 'ArrowDown')
  key(sel, 'Enter')
  expect(sel.value).toBe('c')
  expect(changes).toEqual(['c'])
  expect(sel.getAttribute('aria-expanded')).toBe('false')
})

test('choosing the same option fires nothing', () => {
  const { c, sel, changes } = mount()
  down(sel)
  list(c)!.querySelector<HTMLElement>('[aria-selected="true"]')!.click()
  expect(changes).toEqual([])
})
