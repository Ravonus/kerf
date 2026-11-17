// kerf-allow T005: server context and original DOM identity are the regression subject
import { renderToStringAsync } from '@kerf-js/core/ssr'
import { hydrate } from '@kerf-js/core/dom'
import { flush } from '@kerf-js/core/test'
import { hydration } from '../src/hydrate'
import { Context as ServerContext, ContextArray as ServerArray } from './fixtures/ssr/Context.tsx?kerf-ssr'
import { Context as ClientContext, ContextArray as ClientArray } from './fixtures/ssr/Context.tsx?kerf-hydrate'

afterEach(() => { document.body.innerHTML = '' })
test.each([
  { label: 'a lazy child', server: ServerContext, client: ClientContext },
  { label: 'an array of lazy children', server: ServerArray, client: ClientArray },
])('a provided context survives $label and a nested async Boundary', async ({ server, client }) => {
  const html = await renderToStringAsync(() => server())
  expect(html).toContain('collector</h1>')
  const container = document.body.appendChild(document.createElement('div'))
  container.innerHTML = html
  const heading = container.querySelector('h1')!
  const cleanup = vi.fn()
  const dispose = hydrate(() => client({ cleanup }), container)
  await flush()
  expect(hydration.misses).toBe(0)
  expect(container.querySelector('h1')).toBe(heading)
  expect(heading.textContent).toBe('collector')
  expect(container.querySelector('b')!.textContent).toBe('collector')
  expect(container.querySelector('[data-outside]')!.textContent).toBe('anonymous')
  container.querySelector('button')!.click()
  await flush()
  expect(container.querySelector('b')!.textContent).toBe('collector updated')
  expect(container.querySelector('h1')).toBe(heading)
  expect(heading.textContent).toBe('collector updated')
  expect(cleanup).not.toHaveBeenCalled()
  dispose()
  expect(cleanup).toHaveBeenCalledOnce()
})
