// kerf-allow T004, T005: the toast action's reparenting and sibling DOM positions are the subject
import { state } from '@kerf-js/core'
import { flush } from '@kerf-js/core/test'
import { hydrate } from '@kerf-js/core/dom'
import { renderToString } from '@kerf-js/core/ssr'
// @ts-expect-error: the Vite plugin compiles the fixture for SSR
const server = await import('./fixtures/ToastRehome.tsx?kerf-ssr')
// @ts-expect-error: the Vite plugin compiles the fixture for hydration
const client = await import('./fixtures/ToastRehome.tsx?kerf-hydrate')

afterEach(() => {
  document.body.textContent = ''
})

test('a toast region moved into a modal leaves a stable place for reactive siblings', async () => {
  const quote = state(0)
  const container = document.body.appendChild(document.createElement('div'))
  container.innerHTML = renderToString(() => server.ToastRehome({ open: true, quote: 0 }))
  const dispose = hydrate(
    () =>
      client.ToastRehome({
        open: true,
        get quote() {
          return quote.value
        },
      }),
    container,
  )
  const box = container.querySelector('[data-price-box]')!
  const region = box.querySelector('[data-scope=toast][data-part=region]')!
  const live = [...box.querySelectorAll('[data-scope=announcer]')]
  const modal = document.body.appendChild(document.createElement('dialog'))
  // The framework-free toaster action does exactly this while a native modal is open.
  region.before(document.createComment(''))
  modal.append(region, ...live)
  quote.value = 1
  await expect(flush()).resolves.not.toThrow()
  expect(box.querySelector('p')?.textContent).toBe('Quote 1')
  expect(region.parentNode).toBe(modal)
  expect([...box.children].at(-1)?.hasAttribute('data-after')).toBe(true)
  quote.value = 2
  await flush()
  expect(box.querySelector('p')?.textContent).toBe('Quote 2')
  expect(region.parentNode).toBe(modal)
  dispose()
  modal.remove()
})
