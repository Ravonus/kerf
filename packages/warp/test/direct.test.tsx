// The examples in warp-core's README, run as they're written (test/fixtures/direct-*.tsx): behaviour with no warp component.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { flush, render } from 'weft/test'
import { AccountMenu } from './fixtures/direct-menu'
import { Settings } from './fixtures/direct-tabs'

const tick = () => new Promise(r => setTimeout(r))
const settle = async () => { await tick(); await flush(); await tick(); await flush() }
const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))

test('the fixtures are what the README shows', () => {
  const readme = readFileSync(join(process.cwd(), '../warp-core/README.md'), 'utf8')
  for (const name of ['tabs', 'menu']) expect(readme).toContain(readFileSync(join(process.cwd(), `test/fixtures/direct-${name}.tsx`), 'utf8'))
})

test('tabs: nextIndex wraps and moves focus, the indicator follows, one tab stop', async () => {
  const { container } = render(() => <Settings />)
  document.body.append(container)
  await settle()
  const tabs = [...container.querySelectorAll<HTMLElement>('[role="tab"]')]
  const list = container.querySelector('[role="tablist"]')!
  key(list, 'ArrowLeft')
  await settle()
  expect(tabs[2].getAttribute('aria-selected')).toBe('true')
  expect(document.activeElement).toBe(tabs[2])
  expect(tabs[0].getAttribute('tabindex')).toBe('-1')
  expect(tabs[2].hasAttribute('tabindex')).toBe(false)
  expect(container.querySelector('[role="tabpanel"]')!.textContent).toBe('Team')
  expect(container.querySelector<HTMLElement>('[data-part="indicator"]')!.style.getPropertyValue('--warp-b')).not.toBe('')
  container.remove()
})

test('menu: opens into the first item, arrows move, Escape closes and returns to the trigger', async () => {
  const { container } = render(() => <AccountMenu />)
  document.body.append(container)
  await settle()
  const button = container.querySelector<HTMLElement>('[aria-haspopup]')!
  const panel = container.querySelector<HTMLElement>('[role="menu"]')!
  const items = [...panel.querySelectorAll<HTMLElement>('[role="menuitem"]')]
  expect(panel.hidden).toBe(true)
  button.click()
  await settle()
  expect(panel.hidden).toBe(false)
  expect(document.activeElement).toBe(items[0])
  key(panel.contains(document.activeElement) ? document.activeElement! : panel, 'ArrowDown')
  expect(document.activeElement).toBe(items[1])
  key(document.activeElement!, 'Escape')
  await settle()
  expect(panel.hidden).toBe(true)
  expect(document.activeElement).toBe(button)
  button.click()
  await settle()
  items[1].click()
  await settle()
  expect(location.hash).toBe('#out')
  expect(document.activeElement).toBe(button)
  container.remove()
})
