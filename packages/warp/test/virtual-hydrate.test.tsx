// The collections on the server: first rows as HTML, nothing touching a browser API, and hydration adopting them.
import { resetIds } from '@weft-js/warp-core'
import { hydrate } from '@weft-js/core/dom'
import { renderToString } from '@weft-js/core/ssr'
import { flush } from '@weft-js/core/test'
import { hydration } from '../../core/src/hydrate'
// @ts-expect-error: query imports (@weft-js/core/vite)
const server = await import('./fixtures/Virtual.tsx?weft-ssr')
// @ts-expect-error: query imports (@weft-js/core/vite)
const client = await import('./fixtures/Virtual.tsx?weft-hydrate')

test('server HTML holds a window of each collection; hydration claims it all and writes nothing', async () => {
  resetIds()
  const html = renderToString(() => server.Virtuals())
  for (const part of [
    'role="log"',
    'role="feed"',
    'data-scope="kanban"',
    'role="grid"',
    'aria-posinset="1"',
  ])
    expect(html).toContain(part)
  expect((html.match(/role="article"/g) ?? []).length).toBeLessThanOrEqual(40)
  const root = document.body.appendChild(document.createElement('div'))
  root.innerHTML = html
  const writes: MutationRecord[] = []
  const observer = new MutationObserver((r) => writes.push(...r))
  observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true })
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  resetIds()
  const dispose = hydrate(() => client.Virtuals(), root)
  writes.push(...observer.takeRecords())
  observer.disconnect()
  expect(warn).not.toHaveBeenCalled()
  warn.mockRestore()
  expect(hydration.misses).toBe(0)
  expect(writes).toEqual([])
  await flush()
  dispose()
})
