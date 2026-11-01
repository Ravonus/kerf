// Every component, server-rendered (`?weft-ssr`) and hydrated (`?weft-hydrate`): hydration claims every node (0
// misses) and writes nothing to the DOM, ids included (resetIds before each render, as an app's server and client
// entries do). The hydrated component then works: its interaction shows the same result as a client render.
import { resetIds } from '@weft/warp-core'
import { hydrate } from 'weft/dom'
import { renderToString } from 'weft/ssr'
import { flush } from 'weft/test'
import { hydration } from '../../weft/src/hydrate'
import { cases } from './fixtures/interactions'
// @ts-expect-error: query imports (weft/vite)
import * as server from './fixtures/Cases.tsx?weft-ssr'
// @ts-expect-error
import * as client from './fixtures/Cases.tsx?weft-hydrate'

test.each(Object.keys(cases).filter(n => !n.endsWith('$shape')))('%s: SSR + hydrate, 0 misses, 0 writes, then it works', async name => {
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
  expect(writes.map(w => `${w.type} ${w.attributeName ?? ""} +${[...w.addedNodes].map(n => n.nodeName + ":" + n.textContent).join(",")} -${[...w.removedNodes].map(n => n.nodeName + ":" + n.textContent).join(",")} on ${(w.target as Element).outerHTML?.slice(0, 60) ?? w.target.nodeName}`)).toEqual([])
  root.querySelector('script[data-weft]')?.remove()
  await flush()
  await cases[name as keyof typeof cases].act(root)
  await flush()
  cases[name as keyof typeof cases].see(root)
  dispose()
  root.remove()
})

test('focus never leans on an id: a real server counts on, so its ids differ from the client\'s', async () => {
  resetIds()
  const root = document.body.appendChild(document.createElement('div'))
  root.innerHTML = renderToString(() => server.TabsCase())
  for (const n of root.querySelectorAll('[id]')) n.id = `server-${n.id}`
  resetIds()
  const dispose = hydrate(() => client.TabsCase(), root)
  await flush()
  const [a, b] = root.querySelectorAll<HTMLElement>('[role="tab"]')
  a.focus()
  a.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  await flush()
  expect(document.activeElement).toBe(b)
  dispose()
  root.remove()
})
