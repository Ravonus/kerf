// Nav's bar and page transitions: two elements under one view-transition name make the browser skip the transition, so
// each horizontal nav names its bar from its own label.
import { render } from '@kerf-js/core/test'
import { Nav } from '../src/index'

const bar = (root: ParentNode, label: string) =>
  root.querySelector<HTMLElement>(`nav[aria-label="${label}"] > [data-part="indicator"]`)!
const name = (el: HTMLElement) =>
  /view-transition-name:\s*([^;]+)/.exec(el.getAttribute('style') ?? '')?.[1]

test('a site nav and the section tabs under it name their bars apart, and the same way on every page', () => {
  const page = () => (
    <div>
      <Nav label="Main">
        <a href="/explorer">Explorer</a>
      </Nav>
      <Nav label="Explorer sections">
        <a href="/explorer/transactions">Transactions</a>
      </Nav>
    </div>
  )
  const one = render(page)
  const two = render(page)
  expect(name(bar(one.container, 'Main'))).toBe('veneer-nav-main')
  expect(name(bar(one.container, 'Explorer sections'))).toBe('veneer-nav-explorer-sections')
  expect(name(bar(two.container, 'Main'))).toBe('veneer-nav-main')
  one.unmount()
  two.unmount()
})

test('a label in any script still makes a name CSS accepts, and a vertical nav takes none', () => {
  const view = render(() => (
    <div>
      <Nav label="目次 / Inhalt">
        <a href="/a">A</a>
      </Nav>
      <Nav label="Side" axis="y">
        <a href="/b">B</a>
      </Nav>
    </div>
  ))
  expect(name(bar(view.container, '目次 / Inhalt'))).toMatch(/^veneer-nav-[a-z0-9-]+$/)
  expect(name(bar(view.container, '目次 / Inhalt'))).not.toBe('veneer-nav-')
  expect(bar(view.container, 'Side').hasAttribute('style')).toBe(false)
  view.unmount()
})
