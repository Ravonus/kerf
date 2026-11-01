// Hydration (weft/dom): adopt the DOM `renderToString` produced instead of building it. Each template root the
// server wrote carries its key (` wk="0.1/0"`, research 19 §2.4); compiled hydratable output claims elements by
// key (`tpl`), walks over the server's hole ranges (`first`/`next`) and adopts their nodes (`child`). A key with no
// server element is a miss: dev builds warn, every build counts it in `hydration.misses`, and the client renders
// that template fresh so the app still works.
//
// Hydration is one synchronous pass over the whole container. Events fired before it finishes are dropped, unless the
// app has lazy islands: then `@weft/start`'s capture script holds them for `drain` (island.ts).

import { DEV, createRoot, rt, runMounts, type SsrData } from './index'
import { hchild } from './claim'
import { keys } from './keys'

export const hydration = { misses: 0, registry: new Map<string, Element>(), /** What only the claim needed. */ trash: [] as (ChildNode | Element)[] }

/**
 * After the claim: drop the markers and keys nothing reads again. Later than the pass itself, so hydrating still writes
 * nothing to the DOM, and a page's reads of its nodes don't pay for a tree that holds hundreds of them.
 */
export function sweep() {
  const list = hydration.trash
  hydration.trash = []
  if (list.length) setTimeout(() => {
    for (const n of list) {
      if (n.nodeType === 1) {
        ;(n as Element).removeAttribute('wk')
        delete (n as any).$k
      } else n.remove()
    }
  })
}

/**
 * Hydrate `container`'s server HTML with `code` (the same `() => <App />` the server rendered). The page data is the
 * container's trailing `<script data-weft>`, or `options.data` when the page sends it elsewhere (a stream, research 25).
 */
export function hydrate(code: () => any, container: Element, options: { data?: SsrData | null } = {}): () => void {
  const registry = hydration.registry
  for (const el of container.querySelectorAll('[wk]')) registry.set(el.getAttribute('wk')!, el)
  hydration.misses = 0
  // The server's data (resources, boundary states) stays where it is: the app hydrates the nodes before it.
  const script = container.querySelector(':scope > script[data-weft]')
  rt.data = options.data ?? (script ? JSON.parse(script.textContent!) : undefined)
  rt.state = rt.data?.s
  let dispose!: () => void
  Object.assign(keys, { on: true, hydrating: true, p: '', n: 0 })
  try {
    createRoot(d => {
      dispose = d
      hchild(container, code, script ?? undefined, undefined, undefined, 2) // the app's nodes are those before the data script
    }, null)
  } finally {
    if (hydration.misses) console.warn('weft: rendered fresh, a key differs between server and client (see `weft docs W044`)')
    Object.assign(keys, { on: false, hydrating: false, miss: false, p: '', n: 0 })
    rt.data = undefined
    if (DEV && registry.size) console.warn(`weft: ${registry.size} server element(s) were never claimed (first: wk=${registry.keys().next().value})`)
    registry.clear()
    sweep()
  }
  runMounts()
  return () => {
    dispose()
    container.textContent = ''
  }
}
