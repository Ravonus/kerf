// The markup every component renders, pinned (fixtures/Variants.tsx): the server HTML, and the client DOM once its
// actions have attached. Attributes are sorted (their order means nothing) and weft's hole markers and hydration keys dropped, so a refactor for size passes only if no
// part, attribute, ARIA wire or state moved.
import { resetIds } from '@weft-js/warp-core'
import { renderToString } from '@weft-js/core/ssr'
import { flush, render } from '@weft-js/core/test'
import * as client from './fixtures/Variants'
// @ts-expect-error: query import (@weft-js/core/vite)
import * as server from './fixtures/Variants.tsx?weft-ssr'

const tidy = (html: string) => {
  const t = document.createElement('template')
  t.innerHTML = html
  t.content.querySelectorAll('script[data-weft]').forEach(s => s.remove())
  // weft's hole markers are the framework's bookkeeping, not markup
  const comments = document.createTreeWalker(t.content, NodeFilter.SHOW_COMMENT)
  const drop: Node[] = []
  while (comments.nextNode()) drop.push(comments.currentNode)
  drop.forEach(n => n.parentNode!.removeChild(n))
  t.content.normalize()
  const walk = (el: Element) => {
    // wk is weft's hydration key: bookkeeping too
    const attrs = [...el.attributes].filter(a => a.name !== 'wk').map(a => [a.name, a.value]).sort(([a], [b]) => (a < b ? -1 : 1))
    for (const { name } of [...el.attributes]) el.removeAttribute(name)
    for (const [n, v] of attrs) el.setAttribute(n, v)
    for (const c of el.children) walk(c)
  }
  for (const c of t.content.children) walk(c)
  return t.innerHTML.replace(/></g, '>\n<')
}
const names = Object.keys(client).filter(n => n !== 'seedToasts' && !n.endsWith('$shape')) as (keyof typeof client)[]

test.each(names)('%s: server HTML', name => {
  if (name === 'Toasts') server.seedToasts()
  resetIds()
  expect(tidy(renderToString(() => server[name]()))).toMatchSnapshot()
})

test.each(names)('%s: client DOM after mount', async name => {
  if (name === 'Toasts') client.seedToasts()
  resetIds()
  const { container, unmount } = render(client[name] as any)
  await flush()
  // actions attach a microtask after mount and measure over the next frames (the indicator drops data-instant after two)
  for (let i = 0; i < 4; i++) await new Promise(r => requestAnimationFrame(r))
  await new Promise(r => setTimeout(r, 20))
  expect(tidy(container.innerHTML)).toMatchSnapshot()
  unmount?.()
})
