// SideNav: the section holding the current page starts open and the rest folded, a viewer's folds are remembered (and
// blocked storage is fine), the filter narrows and opens every match, the phone bar opens the sheet, and a link in the
// sheet closes it. Then the server's markup hydrates with its folds live.
import { flush, render } from '@weft-js/core/test'
import { state } from '@weft-js/core'
import { hydrate } from '@weft-js/core/dom'
import { renderToString } from '@weft-js/core/ssr'
import { SideNav } from '../src/index'
import { SECTIONS } from './fixtures/SideNavCase'

const rail = (c: Element) => c.querySelector('[data-part="rail"]')!
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
  expect(c.querySelector('[data-part="bar-page"]')!.textContent).toContain('Props')
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
  const get = Storage.prototype.getItem, set = Storage.prototype.setItem
  Storage.prototype.getItem = () => { throw new Error('blocked') }
  Storage.prototype.setItem = () => { throw new Error('blocked') }
  try {
    const { container: c } = render(() => <SideNav label="Docs" current="/docs/props" sections={SECTIONS} />)
    await flush()
    const advanced = folds(c)[1]!
    advanced.click(); await flush()
    expect(advanced.getAttribute('aria-expanded')).toBe('true')
  } finally {
    Storage.prototype.getItem = get; Storage.prototype.setItem = set
  }
})

test('the filter keeps matching pages, opens their sections, and says when nothing matches', async () => {
  const { container: c } = render(() => <SideNav label="Docs" current="/docs/props" sections={SECTIONS} filter remember={false} />)
  await flush()
  const box = rail(c).querySelector<HTMLInputElement>('[data-part="filter"]')!
  expect(box.getAttribute('aria-label')).toBe('Filter docs')
  box.value = 'ref'; box.dispatchEvent(new Event('input')); await flush()
  expect([...rail(c).querySelectorAll('a')].map(a => a.textContent)).toEqual(['Refs'])
  expect(folds(c).map(b => b.getAttribute('aria-expanded'))).toEqual(['true'])
  box.value = 'zzz'; box.dispatchEvent(new Event('input')); await flush()
  expect(rail(c).querySelector('[data-part="empty"]')!.textContent).toContain('zzz')
})

test('the bar opens the sheet with the same tree; a link in it closes the sheet; a new current page closes it too', async () => {
  const current = state('/docs/props')
  const { container: c } = render(() => <SideNav label="Docs" current={current.value} sections={SECTIONS} remember={false} />)
  await flush()
  const bar = c.querySelector<HTMLButtonElement>('[data-part="bar"]')!
  const sheet = c.querySelector('dialog')!
  expect(bar.getAttribute('aria-haspopup')).toBe('dialog')
  expect(bar.getAttribute('aria-expanded')).toBe('false')
  bar.click(); await flush()
  expect(bar.getAttribute('aria-expanded')).toBe('true')
  const nav = sheet.querySelector('[data-part="sheet-nav"]')!
  expect(nav.querySelector('[aria-current="page"]')!.textContent).toBe('Props')
  expect(new Set([...c.querySelectorAll('[id]')].map(e => e.id)).size).toBe(c.querySelectorAll('[id]').length)
  const link = nav.querySelector<HTMLAnchorElement>('a[href="/docs/state"]')!
  link.addEventListener('click', e => e.preventDefault())
  link.click(); await flush()
  expect(bar.getAttribute('aria-expanded')).toBe('false')
  bar.click(); await flush()
  current.value = '/docs/effects'; await flush()
  expect(bar.getAttribute('aria-expanded')).toBe('false')
  expect(folds(c)[1]!.getAttribute('aria-expanded')).toBe('true')
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
