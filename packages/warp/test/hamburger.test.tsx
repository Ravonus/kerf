// HamburgerMenu: the button opens a modal full-screen menu, marks the current link, closes from its own X and from
// any link inside (children too), and an outside `open` box drives it both ways.
import { flush, render } from '@weft-js/core/test'
import { state } from '@weft-js/core'
import { HamburgerMenu } from '../src/index'

const LINKS = [
  { href: '/learn', label: 'Learn' },
  { href: '/components', label: 'Components' },
]
const parts = (c: Element) => ({
  button: c.querySelector<HTMLButtonElement>('button[data-hamburger]:not([data-part])')!,
  menu: c.querySelector<HTMLDialogElement>('dialog[data-scope="menu-screen"]')!,
})

test('opens from the button as a modal, marks the current link, and the X closes it', async () => {
  const { container: c } = render(() => (
    <HamburgerMenu label="Site" links={LINKS} current="/components" />
  ))
  await flush()
  const { button, menu } = parts(c)
  expect(button.getAttribute('aria-expanded')).toBe('false')
  expect(button.getAttribute('aria-controls')).toBe(menu.id)
  expect(menu.open).toBe(false)
  button.click()
  await flush()
  expect(menu.open).toBe(true)
  expect(button.getAttribute('aria-expanded')).toBe('true')
  expect(menu.querySelector('[aria-current="page"]')!.textContent).toBe('Components')
  expect(menu.getAttribute('aria-label')).toBe('Site')
  menu.querySelector<HTMLButtonElement>('[data-part="close"]')!.click()
  await flush()
  expect(menu.open).toBe(false)
  expect(button.getAttribute('aria-expanded')).toBe('false')
})

test('a link in the links or in children closes it; an outside box opens and closes it', async () => {
  const open = state(false)
  const { container: c } = render(() => (
    <HamburgerMenu open={open} links={LINKS}>
      <a href="#more" data-test="more">
        More
      </a>
    </HamburgerMenu>
  ))
  await flush()
  const { menu } = parts(c)
  open.value = true
  await flush()
  expect(menu.open).toBe(true)
  menu
    .querySelector<HTMLAnchorElement>('a[href="/learn"]')!
    .addEventListener('click', (e) => e.preventDefault())
  menu.querySelector<HTMLAnchorElement>('a[href="/learn"]')!.click()
  await flush()
  expect(open.value).toBe(false)
  expect(menu.open).toBe(false)
  open.value = true
  await flush()
  menu.querySelector<HTMLAnchorElement>('[data-test="more"]')!.click()
  await flush()
  expect(open.value).toBe(false)
})
