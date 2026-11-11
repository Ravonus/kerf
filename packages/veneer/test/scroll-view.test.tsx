// ScrollView server-rendered and hydrated: hydration claims every node and writes nothing, and only then does
// @kerf/scroll take the box over (bars become scrollbars, the viewport scrolls in JavaScript).
import { hydrate } from '@kerf/core/dom'
import { renderToString } from '@kerf/core/ssr'
import { flush } from '@kerf/core/test'
import { hydration } from '../../core/src/hydrate'
// @ts-expect-error: query imports (@kerf/core/vite)
const server = await import('./fixtures/ScrollViewCase.tsx?kerf-ssr')
// @ts-expect-error: query imports (@kerf/core/vite)
const client = await import('./fixtures/ScrollViewCase.tsx?kerf-hydrate')

test('server HTML scrolls natively, and hydrating it writes nothing before the scroller starts', async () => {
  const html = renderToString(() => server.ScrollViewCase())
  expect(html).toContain('data-scope="scroll-view"')
  expect(html).toContain('data-part="viewport"')
  expect(html).not.toContain('data-ready')
  const root = document.body.appendChild(document.createElement('div'))
  root.innerHTML = html
  const writes: MutationRecord[] = []
  const observer = new MutationObserver((r) => writes.push(...r))
  observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true })
  const dispose = hydrate(() => client.ScrollViewCase(), root)
  writes.push(...observer.takeRecords())
  observer.disconnect()
  expect(hydration.misses).toBe(0)
  expect(writes).toEqual([])
  await flush()
  await Promise.resolve()
  const view = root.querySelector<HTMLElement>('[data-scope="scroll-view"]')!
  expect(view.hasAttribute('data-ready')).toBe(true)
  const vp = view.querySelector<HTMLElement>('[data-part="viewport"]')!
  expect(vp.getAttribute('role')).toBe('region')
  expect(vp.getAttribute('aria-label')).toBe('Rows')
  const bar = view.querySelector('[data-orientation="vertical"]')!
  expect(bar.getAttribute('role')).toBe('scrollbar')
  expect(bar.getAttribute('aria-controls')).toBe(vp.id)
  expect(client.got.s?.viewport).toBe(vp)
  dispose()
  expect(view.hasAttribute('data-ready')).toBe(false)
  root.remove()
})
