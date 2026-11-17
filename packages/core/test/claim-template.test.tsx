// kerf-allow T004, T005: hydration markup, template identity and later DOM updates are the subject
import { hydrate } from '@kerf-js/core/dom'
import { renderToString } from '@kerf-js/core/ssr'
import { flush, state } from '@kerf-js/core'
import { hydration } from '../src/hydrate'
import * as Server from './fixtures/ssr/WalletLoading.tsx?kerf-ssr'
import * as Client from './fixtures/ssr/WalletLoading.tsx?kerf-hydrate'

afterEach(() => {
  document.body.textContent = ''
  vi.restoreAllMocks()
})

test('a different template with the same tag cannot claim a loading placeholder', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const rows = state(['first', 'second', 'third'])
  const root = document.body.appendChild(document.createElement('div'))
  root.innerHTML = renderToString(() => <Server.WalletLoading waiting={true} rows={[]} />)
  hydrate(() => <Client.WalletLoading waiting={false} rows={rows.value} />, root)
  expect(root.querySelector('[role=status]')).toBeNull()
  expect(root.querySelector('.wallet-rows')?.textContent).toBe('firstsecondthird')
  rows.value = ['third', 'first']
  expect(() => flush()).not.toThrow()
  expect([...root.querySelectorAll('.wallet-rows button')].map((n) => n.textContent)).toEqual([
    'third',
    'first',
  ])
  expect(hydration.misses).toBeGreaterThan(0)
})

test('matching static attributes retain the input when dynamic values and extra attributes differ', () => {
  const value = state('client')
  const root = document.body.appendChild(document.createElement('div'))
  root.innerHTML = renderToString(() => <Server.StableWalletField value="server" />)
  const input = root.querySelector('input')!
  input.setAttribute('data-browser-added', 'retained')
  hydrate(() => <Client.StableWalletField value={value.value} />, root)
  expect(root.querySelector('input')).toBe(input)
  expect(input.getAttribute('data-browser-added')).toBe('retained')
  expect(input.value).toBe('client')
  value.value = 'updated'
  flush()
  expect(input.value).toBe('updated')
  expect(hydration.misses).toBe(0)
})
