// Hydration (weft/dom): adopt the DOM `renderToString` produced instead of building it. Each template root the
// server wrote carries its key (` wk="0.1/0"`, research 19 §2.4); compiled hydratable output claims elements by
// key (`tpl`), walks over the server's hole ranges (`first`/`next`) and adopts their nodes (`child`). A key with no
// server element is a miss: dev builds warn, every build counts it in `hydration.misses`, and the client renders
// that template fresh so the app still works.
//
// Phase 1: events fired before hydration finishes are dropped (no capture script yet), and hydration is one
// synchronous pass over the whole container.

import { DEV, createRoot, rt, runMounts } from './index'
import { hchild } from './claim'
import { keys } from './keys'

export const hydration = { misses: 0, registry: new Map<string, Element>() }

/** Hydrate `container`'s server HTML with `code` (the same `() => <App />` the server rendered). */
export function hydrate(code: () => any, container: Element): () => void {
  const registry = hydration.registry
  for (const el of container.querySelectorAll('[wk]')) registry.set(el.getAttribute('wk')!, el)
  hydration.misses = 0
  // The server's data (resources, boundary states) stays where it is: the app hydrates the nodes before it.
  const script = container.querySelector(':scope > script[data-weft]')
  rt.data = script ? JSON.parse(script.textContent!) : undefined
  let dispose!: () => void
  Object.assign(keys, { on: true, hydrating: true, p: '', n: 0 })
  try {
    createRoot(d => {
      dispose = d
      hchild(container, code, script ?? undefined, undefined, undefined, 1) // the app's nodes are those before the data script
    }, null)
  } finally {
    Object.assign(keys, { on: false, hydrating: false, p: '', n: 0 })
    rt.data = undefined
    if (DEV && registry.size) console.warn(`weft: ${registry.size} server element(s) were never claimed (first: wk=${registry.keys().next().value})`)
    registry.clear()
  }
  runMounts()
  return () => {
    dispose()
    container.textContent = ''
  }
}
