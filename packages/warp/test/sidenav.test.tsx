// SideNav: the section holding the current page starts open and the rest folded, a viewer's folds are remembered (and
// blocked storage is fine), the filter narrows and opens every match, and where the panel is laid over the page a
// button outside opens it and the close button, Escape, the backdrop, a link and a new page close it. Then the
// server's markup hydrates with its folds live.
import { flush, render } from '@weft-js/core/test'
import { state } from '@weft-js/core'
import { hydrate } from '@weft-js/core/dom'
import { renderToString } from '@weft-js/core/ssr'
import { SideNav } from '../src/index'
import { SECTIONS } from './fixtures/SideNavCase'

const rail = (c: Element) => c.querySelector('[data-scope="sidenav"] nav')!
const folds = (c: Element) => [...rail(c).querySelectorAll<HTMLButtonElement>('button[data-fold]')]
const shown = (b: HTMLButtonElement) => !document.getElementById(b.getAttribute('aria-controls')!)!.hidden

beforeEach(() => localStorage.clear())

test('the current section starts open, the others folded; the current link is marked; a pinned section has no fold', async () => {
  const { container: c } = render(() => <SideNav label="Docs" current="/docs/props" sections={SECTIONS} />)
  await flush()
  const [basics, advanced] = folds(c) as [HTMLButtonElement, HTMLButtonElement]
  expect(folds(c)).toHaveLength(2)
  expect(basics.getAttribute('aria-expanded')).toBe('true')
  expect(advanced.getAttribute('aria-expanded')).toBe('false')
  expect(shown(basics)).toBe(true)
  expect(shown(advanced)).toBe(false)
  expect(rail(c).querySelector('[aria-current="page"]')!.textContent).toBe('Props')
  expect(rail(c).getAttribute('aria-label')).toBe('Docs')
})

test('a fold toggles and is remembered under the key; the current section reopens on arrival', async () => {
  const one = render(() => <SideNav label="Docs" current="/docs/props" sections={SECTIONS} remember="k" />)
  await flush()
  const [basics, advanced] = folds(one.container) as [HTMLButtonElement, HTMLButtonElement]
  advanced.click(); basics.click(); await flush()
  expect(advanced.getAttribute('aria-expanded')).toBe('true')
  expect(basics.getAttribute('aria-expanded')).toBe('false')
  expect(JSON.parse(localStorage.getItem('k')!)).toEqual({ Advanced: true, Basics: false })
  one.unmount()

  const two = render(() => <SideNav label="Docs" current="/docs/props" sections={SECTIONS} remember="k" />)
  await flush()
  const [b2, a2] = folds(two.container) as [HTMLButtonElement, HTMLButtonElement]
  expect(a2.getAttribute('aria-expanded')).toBe('true') // remembered
  expect(b2.getAttribute('aria-expanded')).toBe('true') // holds the current page, so it opens anyway
  two.unmount()
})

test('blocked storage: folds still work for the visit', async () => {
  const blocked = () => { throw new Error('blocked') }
  const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked)
  const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked)
  try {
    const { container: c } = render(() => <SideNav label="Docs" current="/docs/props" sections={SECTIONS} />)
    await flush()
    const advanced = folds(c)[1]!
    advanced.click(); await flush()
    expect(advanced.getAttribute('aria-expanded')).toBe('true')
  } finally {
    get.mockRestore(); set.mockRestore()
  }
})

test('the filter keeps matching pages, opens their sections, and says when nothing matches', async () => {
  const { container: c } = render(() => <SideNav label="Docs" current="/docs/props" sections={SECTIONS} filter remember={false} />)
  await flush()
  const box = c.querySelector<HTMLInputElement>('[data-scope="sidenav"] [data-part="filter"]')!
  expect(box.getAttribute('aria-label')).toBe('Filter docs')
  box.value = 'ref'; box.dispatchEvent(new Event('input', { bubbles: true })); await flush()
  expect([...rail(c).querySelectorAll('a')].map(a => a.textContent)).toEqual(['Refs'])
  expect(folds(c).map(b => b.getAttribute('aria-expanded'))).toEqual(['true'])
  box.value = 'zzz'; box.dispatchEvent(new Event('input', { bubbles: true })); await flush()
  expect(c.querySelector('[data-scope="sidenav"] [data-part="empty"]')!.textContent).toContain('zzz')
})

test('laid over the page, a button outside opens it; close, Escape, the backdrop, a link and a new page close it', async () => {
  const current = state('/docs/props')
  const { container: c } = render(() => <><button type="button" id="menu" aria-controls="docs-nav">Menu</button><SideNav id="docs-nav" label="Docs" current={current.value} sections={SECTIONS} remember={false} /></>)
  await flush()
  const panel = c.querySelector<HTMLElement>('#docs-nav')!
  panel.style.position = 'fixed' // what the CSS does under 900px; jsdom loads no stylesheets
  const root = c.querySelector<HTMLElement>('[data-scope="sidenav"]')!
  const menu = c.querySelector<HTMLButtonElement>('#menu')!
  const isOpen = () => root.hasAttribute('data-open')
  const press = async () => { menu.focus(); menu.click(); await flush(); await new Promise(r => { requestAnimationFrame(r) }) }
  await press()
  expect(isOpen()).toBe(true)
  expect(menu.getAttribute('aria-expanded')).toBe('true')
  expect(panel.getAttribute('role')).toBe('dialog')
  expect(panel.getAttribute('aria-modal')).toBe('true')
  expect(document.getElementById(panel.getAttribute('aria-labelledby')!)!.textContent).toBe('Docs')
  expect(document.activeElement).toBe(panel.querySelector('[data-part="close"]'))
  panel.querySelector<HTMLButtonElement>('[data-part="close"]')!.click(); await flush()
  expect(isOpen()).toBe(false)
  expect(menu.getAttribute('aria-expanded')).toBe('false')
  expect(panel.hasAttribute('role')).toBe(false)
  expect(document.activeElement).toBe(menu)

  await press()
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flush()
  expect(isOpen()).toBe(false)

  await press()
  root.querySelector<HTMLElement>('[data-part="backdrop"]')!.click(); await flush()
  expect(isOpen()).toBe(false)

  await press()
  const link = panel.querySelector<HTMLAnchorElement>('a[href="/docs/state"]')!
  link.addEventListener('click', e => e.preventDefault())
  link.click(); await flush()
  expect(isOpen()).toBe(false)

  await press()
  current.value = '/docs/effects'; await flush()
  expect(isOpen()).toBe(false)
  expect(folds(c)[1]!.getAttribute('aria-expanded')).toBe('true')
})

test('docked, a button that names it does nothing and leaves no modal state', async () => {
  const { container: c } = render(() => <><button type="button" id="menu" aria-controls="docs-nav">Menu</button><SideNav id="docs-nav" label="Docs" sections={SECTIONS} remember={false} /></>)
  await flush()
  c.querySelector<HTMLButtonElement>('#menu')!.click(); await flush()
  expect(c.querySelector('[data-scope="sidenav"]')!.hasAttribute('data-open')).toBe(false)
  expect(c.querySelector('#docs-nav')!.hasAttribute('role')).toBe(false)
})

test('hydrates the server markup with its folds live', async () => {
  // @ts-expect-error: query imports (@weft-js/core/vite)
  const server = await import('./fixtures/SideNavCase.tsx?weft-ssr')
  // @ts-expect-error: query imports (@weft-js/core/vite)
  const client = await import('./fixtures/SideNavCase.tsx?weft-hydrate')
  const root = document.body.appendChild(document.createElement('div'))
  root.innerHTML = renderToString(() => server.Case())
  const before = root.querySelectorAll('a').length
  const d = hydrate(() => client.Case(), root)
  await flush()
  expect(root.querySelectorAll('a').length).toBe(before)
  const advanced = folds(root)[1]!
  expect(advanced.getAttribute('aria-expanded')).toBe('false')
  advanced.click(); await flush()
  expect(advanced.getAttribute('aria-expanded')).toBe('true')
  expect(JSON.parse(localStorage.getItem('test:sidenav')!)).toEqual({ Advanced: true })
  d(); root.remove()
})
