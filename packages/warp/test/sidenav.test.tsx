// SideNav: the section holding the current page starts open and the rest folded, a viewer's folds are remembered (and
// blocked storage is fine), and the filter narrows and opens every match. Its collapse bar, where the panel is laid
// over the page, opens it and closes it again, as Escape and the backdrop do, with focus going in and back to the bar;
// docked, it folds the sidebar to the bar, remembered, and with storage blocked too. Without the bar, a button outside
// opens it and the close button, Escape, the backdrop, a link and a new page close it. Then the server's markup
// hydrates with its folds and bar live.
import { flush, render } from '@weft-js/core/test'
import { state } from '@weft-js/core'
import { hydrate } from '@weft-js/core/dom'
import { renderToString } from '@weft-js/core/ssr'
import { SideNav } from '../src/index'
import { SECTIONS } from './fixtures/SideNavCase'

const rail = (c: Element) => c.querySelector('[data-scope="sidenav"] nav')!
const folds = (c: Element) => [...rail(c).querySelectorAll<HTMLButtonElement>('button[data-fold]')]
const shown = (b: HTMLButtonElement) =>
  !document.getElementById(b.getAttribute('aria-controls')!)!.hidden
const edge = (c: Element) =>
  c.querySelector<HTMLButtonElement>('[data-scope="sidenav"] [data-part="bar"]')!
const frame = () =>
  new Promise((r) => {
    requestAnimationFrame(r)
  })
/** What the CSS does under 900px; jsdom loads no stylesheets. */
const overlay = (c: Element) => {
  c.querySelector<HTMLElement>('[data-scope="sidenav"] > [data-part="panel"]')!.style.position =
    'fixed'
}

beforeEach(() => localStorage.clear())

test('the current section starts open, the others folded; the current link is marked; a pinned section has no fold', async () => {
  const { container: c } = render(() => (
    <SideNav label="Docs" current="/docs/props" sections={SECTIONS} />
  ))
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

test("the links carry warp's sliding bar: it takes over at the next frame and moves when the pointer does", async () => {
  const { container: c } = render(() => (
    <SideNav label="Docs" current="/docs/props" sections={SECTIONS} />
  ))
  await flush()
  const bar = rail(c).querySelector<HTMLElement>(':scope > [data-part="indicator"]')
  expect(bar).not.toBeNull()
  await new Promise<void>((done) => {
    requestAnimationFrame(() => done())
  })
  expect(rail(c).hasAttribute('data-ready')).toBe(true)
  const other = [...rail(c).querySelectorAll<HTMLAnchorElement>('a[href]')].find(
    (a) => !a.hasAttribute('aria-current') && !a.closest('[hidden]'),
  )!
  // jsdom lays nothing out: give the hovered link a place, as a browser would.
  other.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 96, width: 200, height: 32 })
  other.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
  expect(bar!.style.transform).toBe('translate(0px, 96px) scaleY(32)')
})

test('a fold toggles and is remembered under the key; the current section reopens on arrival', async () => {
  const one = render(() => (
    <SideNav label="Docs" current="/docs/props" sections={SECTIONS} remember="k" />
  ))
  await flush()
  const [basics, advanced] = folds(one.container) as [HTMLButtonElement, HTMLButtonElement]
  advanced.click()
  basics.click()
  await flush()
  expect(advanced.getAttribute('aria-expanded')).toBe('true')
  expect(basics.getAttribute('aria-expanded')).toBe('false')
  expect(JSON.parse(localStorage.getItem('k')!)).toEqual({ Advanced: true, Basics: false })
  one.unmount()

  const two = render(() => (
    <SideNav label="Docs" current="/docs/props" sections={SECTIONS} remember="k" />
  ))
  await flush()
  const [b2, a2] = folds(two.container) as [HTMLButtonElement, HTMLButtonElement]
  expect(a2.getAttribute('aria-expanded')).toBe('true') // remembered
  expect(b2.getAttribute('aria-expanded')).toBe('true') // holds the current page, so it opens anyway
  two.unmount()
})

test('blocked storage: folds still work for the visit', async () => {
  const blocked = () => {
    throw new Error('blocked')
  }
  const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked)
  const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked)
  try {
    const { container: c } = render(() => (
      <SideNav label="Docs" current="/docs/props" sections={SECTIONS} />
    ))
    await flush()
    const advanced = folds(c)[1]!
    advanced.click()
    await flush()
    expect(advanced.getAttribute('aria-expanded')).toBe('true')
  } finally {
    get.mockRestore()
    set.mockRestore()
  }
})

test('the filter keeps matching pages, opens their sections, and says when nothing matches', async () => {
  const { container: c } = render(() => (
    <SideNav label="Docs" current="/docs/props" sections={SECTIONS} filter remember={false} />
  ))
  await flush()
  const box = c.querySelector<HTMLInputElement>('[data-scope="sidenav"] [data-part="filter"]')!
  expect(box.getAttribute('aria-label')).toBe('Filter docs')
  box.value = 'ref'
  box.dispatchEvent(new Event('input', { bubbles: true }))
  await flush()
  expect([...rail(c).querySelectorAll('a')].map((a) => a.textContent)).toEqual(['Refs'])
  expect(folds(c).map((b) => b.getAttribute('aria-expanded'))).toEqual(['true'])
  box.value = 'zzz'
  box.dispatchEvent(new Event('input', { bubbles: true }))
  await flush()
  expect(c.querySelector('[data-scope="sidenav"] [data-part="empty"]')!.textContent).toContain(
    'zzz',
  )
})

test('laid over the page, the bar opens the panel and closes it, with focus going in and back to the bar', async () => {
  const { container: c } = render(() => (
    <SideNav label="Docs" current="/docs/props" sections={SECTIONS} remember={false} />
  ))
  await flush()
  overlay(c)
  const root = c.querySelector<HTMLElement>('[data-scope="sidenav"]')!
  const panel = root.querySelector<HTMLElement>('[data-part="panel"]')!
  const b = edge(c)
  expect(b.getAttribute('aria-controls')).toBe(panel.id)
  expect(b.querySelector('[data-part="bar-label"]')!.textContent).toBe('Docs')
  expect(root.querySelector('[data-part="close"]')).toBeNull() // the bar is the way out
  b.focus()
  b.click()
  await flush()
  await frame()
  expect(root.hasAttribute('data-open')).toBe(true)
  expect(b.getAttribute('aria-expanded')).toBe('true')
  expect(panel.getAttribute('role')).toBe('dialog')
  expect(panel.contains(document.activeElement)).toBe(true)
  expect(document.activeElement).not.toBe(b)
  b.click()
  await flush()
  expect(root.hasAttribute('data-open')).toBe(false)
  expect(b.getAttribute('aria-expanded')).toBe('false')
  expect(panel.hasAttribute('role')).toBe(false)
  expect(document.activeElement).toBe(b)
})

test('laid over the page, Escape and the backdrop close what the bar opened, and focus goes back to the bar', async () => {
  const { container: c } = render(() => (
    <SideNav label="Docs" current="/docs/props" sections={SECTIONS} remember={false} />
  ))
  await flush()
  overlay(c)
  const root = c.querySelector<HTMLElement>('[data-scope="sidenav"]')!
  const b = edge(c)
  const press = async () => {
    b.focus()
    b.click()
    await flush()
    await frame()
    expect(root.hasAttribute('data-open')).toBe(true)
  }
  await press()
  root.querySelector<HTMLAnchorElement>('a[aria-current="page"]')!.focus()
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await flush()
  expect(root.hasAttribute('data-open')).toBe(false)
  expect(b.getAttribute('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(b)
  await press()
  ;(document.activeElement as HTMLElement).blur() // a press on the backdrop takes focus off to the body
  root.querySelector<HTMLElement>('[data-part="backdrop"]')!.click()
  await flush()
  expect(root.hasAttribute('data-open')).toBe(false)
  expect(document.activeElement).toBe(b)
})

test('docked, the bar folds the sidebar to itself and back, and the fold is remembered', async () => {
  const one = render(() => (
    <SideNav label="Docs" current="/docs/props" sections={SECTIONS} remember="k" />
  ))
  await flush()
  const root = () => one.container.querySelector<HTMLElement>('[data-scope="sidenav"]')!
  expect(root().hasAttribute('data-collapsible')).toBe(true)
  expect(root().hasAttribute('data-collapsed')).toBe(false)
  expect(edge(one.container).getAttribute('aria-expanded')).toBe('true')
  edge(one.container).click()
  await flush()
  expect(root().hasAttribute('data-collapsed')).toBe(true)
  expect(root().hasAttribute('data-open')).toBe(false) // docked: folding is not opening
  expect(edge(one.container).getAttribute('aria-expanded')).toBe('false')
  expect(localStorage.getItem('k:collapsed')).toBe('1')
  one.unmount()

  const two = render(() => (
    <SideNav label="Docs" current="/docs/props" sections={SECTIONS} remember="k" />
  ))
  await flush()
  const r2 = two.container.querySelector<HTMLElement>('[data-scope="sidenav"]')!
  expect(r2.hasAttribute('data-collapsed')).toBe(true) // a reload keeps it
  expect(edge(two.container).getAttribute('aria-expanded')).toBe('false')
  edge(two.container).click()
  await flush()
  expect(r2.hasAttribute('data-collapsed')).toBe(false)
  expect(localStorage.getItem('k:collapsed')).toBe('0')
  two.unmount()
})

test('docked, with storage blocked the bar still folds and unfolds the sidebar', async () => {
  const blocked = () => {
    throw new Error('blocked')
  }
  const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked)
  const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked)
  try {
    const { container: c } = render(() => (
      <SideNav label="Docs" current="/docs/props" sections={SECTIONS} />
    ))
    await flush()
    const root = c.querySelector<HTMLElement>('[data-scope="sidenav"]')!
    edge(c).click()
    await flush()
    expect(root.hasAttribute('data-collapsed')).toBe(true)
    edge(c).click()
    await flush()
    expect(root.hasAttribute('data-collapsed')).toBe(false)
  } finally {
    get.mockRestore()
    set.mockRestore()
  }
})

test('collapsible={false} has no bar: a button outside opens it; close, Escape, the backdrop, a link and a new page close it', async () => {
  const current = state('/docs/props')
  const { container: c } = render(() => (
    <>
      <button type="button" id="menu" aria-controls="docs-nav">
        Menu
      </button>
      <SideNav
        id="docs-nav"
        label="Docs"
        current={current.value}
        sections={SECTIONS}
        remember={false}
        collapsible={false}
      />
    </>
  ))
  await flush()
  expect(c.querySelector('[data-part="bar"]')).toBeNull()
  const panel = c.querySelector<HTMLElement>('#docs-nav')!
  panel.style.position = 'fixed' // what the CSS does under 900px; jsdom loads no stylesheets
  const root = c.querySelector<HTMLElement>('[data-scope="sidenav"]')!
  const menu = c.querySelector<HTMLButtonElement>('#menu')!
  const isOpen = () => root.hasAttribute('data-open')
  const press = async () => {
    menu.focus()
    menu.click()
    await flush()
    await new Promise((r) => {
      requestAnimationFrame(r)
    })
  }
  await press()
  expect(isOpen()).toBe(true)
  expect(menu.getAttribute('aria-expanded')).toBe('true')
  expect(panel.getAttribute('role')).toBe('dialog')
  expect(panel.getAttribute('aria-modal')).toBe('true')
  expect(document.getElementById(panel.getAttribute('aria-labelledby')!)!.textContent).toBe('Docs')
  expect(document.activeElement).toBe(panel.querySelector('[data-part="close"]'))
  panel.querySelector<HTMLButtonElement>('[data-part="close"]')!.click()
  await flush()
  expect(isOpen()).toBe(false)
  expect(menu.getAttribute('aria-expanded')).toBe('false')
  expect(panel.hasAttribute('role')).toBe(false)
  expect(document.activeElement).toBe(menu)

  await press()
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await flush()
  expect(isOpen()).toBe(false)

  await press()
  root.querySelector<HTMLElement>('[data-part="backdrop"]')!.click()
  await flush()
  expect(isOpen()).toBe(false)

  await press()
  const link = panel.querySelector<HTMLAnchorElement>('a[href="/docs/state"]')!
  link.addEventListener('click', (e) => e.preventDefault())
  link.click()
  await flush()
  expect(isOpen()).toBe(false)

  await press()
  current.value = '/docs/effects'
  await flush()
  expect(isOpen()).toBe(false)
  expect(folds(c)[1]!.getAttribute('aria-expanded')).toBe('true')
})

test('docked, a button that names it does nothing and leaves no modal state', async () => {
  const { container: c } = render(() => (
    <>
      <button type="button" id="menu" aria-controls="docs-nav">
        Menu
      </button>
      <SideNav id="docs-nav" label="Docs" sections={SECTIONS} remember={false} />
    </>
  ))
  await flush()
  c.querySelector<HTMLButtonElement>('#menu')!.click()
  await flush()
  expect(c.querySelector('[data-scope="sidenav"]')!.hasAttribute('data-open')).toBe(false)
  expect(c.querySelector('#docs-nav')!.hasAttribute('role')).toBe(false)
})

test('hydrates the server markup with its folds and its bar live', async () => {
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
  advanced.click()
  await flush()
  expect(advanced.getAttribute('aria-expanded')).toBe('true')
  expect(JSON.parse(localStorage.getItem('test:sidenav')!)).toEqual({ Advanced: true })
  expect(root.querySelectorAll('[data-part="bar"]').length).toBe(1)
  edge(root).click()
  await flush()
  expect(root.querySelector('[data-scope="sidenav"]')!.hasAttribute('data-collapsed')).toBe(true)
  expect(edge(root).getAttribute('aria-expanded')).toBe('false')
  expect(localStorage.getItem('test:sidenav:collapsed')).toBe('1')
  d()
  root.remove()
})
