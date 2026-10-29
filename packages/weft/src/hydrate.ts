// Hydration (weft/dom): adopt the DOM `renderToString` produced instead of building it. The compiled hydratable
// output (`hydratable: true`) asks for each element by key (`getNextElement`); keys come from the owner tree, which
// weft/ssr built the same way on the server. A key with no server element is a mismatch: dev builds warn, every
// build counts it in `hydration.misses`, and the client renders that element fresh so the app still works.
//
// Phase 1: events fired before hydration finishes are dropped (no capture script yet), and hydration is one
// synchronous pass over the whole container.

import { DEV, childKey, createRoot, getOwner, rt } from './index'
import { insert } from './dom'

export const hydration = { misses: 0, registry: new Map<string, Element>() }

/** Hydrate `container`'s server HTML with `code` (the same `() => <App />` the server rendered). */
export function hydrate(code: () => any, container: Element): () => void {
  const registry = hydration.registry
  for (const el of container.querySelectorAll('[_hk]')) registry.set(el.getAttribute('_hk')!, el)
  hydration.misses = 0
  // The server's data (resources, boundary states) stays where it is: the app hydrates the nodes before it.
  const script = container.querySelector(':scope > script[data-weft]')
  rt.data = script ? JSON.parse(script.textContent!) : undefined
  let dispose!: () => void
  const prev = rt.ids
  rt.ids = true
  try {
    createRoot(d => {
      dispose = d
      if (!script) insert(container, code())
      else insert(container, code(), script, [...container.childNodes].slice(0, [...container.childNodes].indexOf(script)))
    }, null, '')
  } finally {
    rt.ids = prev
    rt.data = undefined
    if (DEV && registry.size) console.warn(`weft: ${registry.size} server element(s) were never claimed (first: _hk=${registry.keys().next().value})`)
    registry.clear()
  }
  return () => {
    dispose()
    container.textContent = ''
  }
}

export function getNextElement(template?: (() => Node) & { html?: string }): Element {
  const key = rt.ids ? childKey(getOwner()) : undefined
  const node = key !== undefined ? hydration.registry.get(key) : undefined
  if (node) {
    hydration.registry.delete(key!)
    const tag = template?.html && /^<([\w-]+)/.exec(template.html)?.[1]
    if (!tag || node.localName === tag) return node
    if (DEV) console.warn(`weft: hydration tag mismatch at _hk=${key}: expected <${tag}>, found <${node.localName}>`)
  } else if (key !== undefined && DEV) {
    console.warn(`weft: hydration key miss at _hk=${key}${template?.html ? ` (${template.html.slice(0, 60)})` : ''}; rendering it fresh`)
  }
  if (key !== undefined) hydration.misses++
  if (!template) throw new Error(`weft: no server element for hydration key ${key}`)
  return template() as Element
}

/** From the node after a `<!--$-->` marker: the matching `<!--/-->` and the server nodes before it. */
export function getNextMarker(start: Node): [Node, Node[]] {
  const nodes: Node[] = []
  let depth = 0
  for (let n: Node | null = start; n; n = n.nextSibling) {
    if (n.nodeType === 8) {
      const v = (n as Comment).data
      if (v === '$') depth++
      else if (v === '/') {
        if (depth === 0) return [n, nodes]
        depth--
      }
    }
    nodes.push(n)
  }
  throw new Error('weft: hydration marker <!--$--> has no matching <!--/-->')
}

export function getNextMatch(el: Node | null, name: string): Element {
  while (el && (el as Element).localName !== name) el = el.nextSibling
  return el as Element
}

export const getFirstChild = (node: Node, _tag?: string) => node.firstChild
export const getNextSibling = (node: Node, _tag?: string) => node.nextSibling

/** Replays events captured before hydration. Phase 1 captures none. */
export function runHydrationEvents() {}

/** Compiler tag for a hole that can create owners or elements: its insert effect takes an id of its own. */
export function scope<T extends () => any>(fn: T): T {
  ;(fn as any).$s = true
  return fn
}
