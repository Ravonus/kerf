// The rich inputs, server-rendered and hydrated: every node claimed, nothing written, as in hydrate.test.tsx.
import { resetIds } from '@weft-js/warp-core'
import { hydrate } from '@weft-js/core/dom'
import { renderToString } from '@weft-js/core/ssr'
import { hydration } from '../../weft/src/hydrate'
// @ts-expect-error: query imports (@weft-js/core/vite)
const server = await import('./fixtures/Rich.tsx?weft-ssr')
// @ts-expect-error: query imports (@weft-js/core/vite)
const client = await import('./fixtures/Rich.tsx?weft-hydrate')

test.each(Object.keys(client).filter(n => n.endsWith('Case')))('%s: SSR + hydrate, 0 misses, 0 writes', name => {
  resetIds()
  const html = renderToString(() => server[name]())
  const root = document.body.appendChild(document.createElement('div'))
  root.innerHTML = html
  const writes: MutationRecord[] = []
  const observer = new MutationObserver(r => writes.push(...r))
  observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true })
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  resetIds()
  const dispose = hydrate(() => client[name](), root)
  writes.push(...observer.takeRecords())
  observer.disconnect()
  expect(warn).not.toHaveBeenCalled()
  warn.mockRestore()
  expect(hydration.misses).toBe(0)
  expect(writes).toEqual([])
  dispose()
  root.remove()
})
