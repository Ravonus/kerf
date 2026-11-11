// The claiming halves of `tpl` and `child`, for hydratable output only (research 19 §2.4, §5.6). While keys are on,
// each template instance takes the next key; while `keys.hydrating`, `htpl` claims the server's element with that
// key instead of cloning, `first`/`next` step over the server's marked hole ranges, and `hchild` adopts the nodes in
// its range. Client-only output imports `tpl` and `child` (dom-next.ts) instead, so none of this ships there.

import { DEV, untrack } from './index'
import { hole } from './index/lifecycle'
import { insert, place, write, type Hold } from './dom'
import { keys, nextKey, under } from './keys'
import { marks } from './island'
import { hydration } from './hydrate'

/** A template root while hydrating: `$k` is its key, which its holes scope theirs under. */
type Keyed = Node & { $k?: string }

/**
 * `tpl` for hydratable output: `htpl(html)()` clones it. `svg`: the root is an SVG element outside an <svg>. `where`
 * (dev builds): `file:line <tag>`, for warnings. While keys are on, each instance takes the next key; while
 * hydrating, the server's element with that key is claimed.
 */
export function htpl(html: string, svg?: boolean, where?: string): () => Node {
  let node: Node | undefined
  const tag = /^<([\w:-]+)/.exec(html)![1]!
  const clone = () => {
    if (!node) {
      const t = document.createElement('template')
      // oxlint-disable-next-line kerf/no-html-sink -- `html` is a template the compiler wrote from static markup, never a runtime value
      t.innerHTML = svg ? `<svg>${html}</svg>` : html
      node = svg ? t.content.firstChild!.firstChild! : t.content.firstChild!
    }
    return node.cloneNode(true)
  }
  return () => {
    if (!keys.on) return clone()
    const key = nextKey()
    if (keys.hydrating) {
      const el = hydration.registry.get(key)
      if (el && el.localName === tag.toLowerCase()) {
        hydration.registry.delete(key)
        keys.miss = false
        hydration.trash.push(el)
        ;(el as Keyed).$k = key
        return el
      }
      if (!hydration.misses++) hydration.first = key
      keys.miss = true
      // No server nodes under this template: its bindings write, and the holes below it build, until the hole it's in ends.
      keys.hydrating = false
      if (DEV) {
        const at = where ?? html.slice(0, 60)
        console.warn(
          el
            ? `kerf: hydration mismatch at ${at} (wk=${key}): the client renders <${tag}>, the server rendered <${el.localName}>; rendering it fresh`
            : `kerf: hydration key miss at ${at} (wk=${key}): the server rendered nothing with this key; rendering it fresh`,
        )
      }
    }
    const fresh = clone() as Keyed
    fresh.$k = key
    return fresh
  }
}

// ---- walking a claimed template -------------------------------------------------------------------------------

/** A server hole range `<!--[-->…<!--]-->` stands where the template has one `<!>`: step to its end marker. */
function over(n: Node | null): Node | null {
  if (!n || n.nodeType !== 8 || (n as Comment).data !== '[') return n
  let depth = 0
  for (let m = n.nextSibling; m; m = m.nextSibling) {
    if (m.nodeType !== 8) continue
    const d = (m as Comment).data
    if (d === '[') depth++
    else if (d === ']' && depth-- === 0) return m
  }
  return null
}

/** `firstChild` / `nextSibling` in hydratable output. Outside hydration there are no ranges and they're the same. */
export const first = (n: Node) => over(n.firstChild)
/** `nextSibling`, stepping over a server hole range the same way. */
export const next = (n: Node) => over(n.nextSibling)

/**
 * The server's nodes in a hole: the parent's children (only content), or those between `marker`'s range start and
 * it. A marker that isn't a template's `<!>` (hydrate's data script) takes everything before it.
 */
function range(parent: Node, marker: Node | undefined): Node[] {
  if (!marker) return [...parent.childNodes].filter((n) => !marks(n))
  if (marker.nodeType === 8 && !(marker as Comment).data) return [] // an empty hole (ssr.ts), or a fresh template's `<!>`
  const nodes: Node[] = []
  let depth = 0
  for (let n = marker.previousSibling; n; n = n.previousSibling) {
    if (n.nodeType === 8) {
      const d = (n as Comment).data
      if (marks(n)) {
        // Partial hydration's own markers bound a hole that holds a level, and are nobody's nodes.
        if (d[0] === '/') depth++
        else if (d.startsWith('wl:') && depth-- === 0) return nodes.reverse()
        continue
      }
      if (d === ']') depth++
      else if (d === '[' && depth-- === 0) {
        hydration.trash.push(n)
        return nodes.reverse()
      }
    }
    nodes.push(n)
  }
  return marker.nodeType === 8 ? [] : nodes.reverse() // a fresh template's `<!>`: nothing to claim
}

/**
 * The value's nodes, reusing the server's: claimed elements are already the server's nodes; text takes the next
 * server text node (rewritten only if it differs); `<!--,-->` separators the server put between texts are kept.
 */
function adopt(value: unknown, server: Node[], at: { i: number }, out: Node[]): Node[] {
  while (typeof value === 'function') value = value()
  if (value == null || typeof value === 'boolean' || value === '') return out
  if (Array.isArray(value)) {
    for (const v of value) adopt(v, server, at, out)
    return out
  }
  if (value instanceof Node) {
    const i = server.indexOf(value, at.i)
    if (i >= 0) {
      for (let j = at.i; j < i; j++) if (isSeparator(server[j]!)) keepUntilSwept(server[j]!, out)
      at.i = i + 1
    }
    out.push(value)
    return out
  }
  // oxlint-disable-next-line typescript/no-base-to-string -- whatever reaches here is a primitive or a mistake, and a mistake should show as it does anywhere else
  const text = String(value)
  while (at.i < server.length && isSeparator(server[at.i]!)) keepUntilSwept(server[at.i++]!, out)
  const n = server[at.i]
  if (n && n.nodeType === 3) {
    at.i++
    if ((n as Text).data !== text) (n as Text).data = text
    out.push(n)
  } else out.push(document.createTextNode(text))
  return out
}

const keepUntilSwept = (n: Node, out: Node[]) => {
  out.push(n)
  hydration.trash.push(n as ChildNode)
}

const isSeparator = (n: Node) => n.nodeType === 8 && (n as Comment).data === ','

/**
 * `child` for hydratable output. `marker`: the `<!>` it goes before, or none when the hole is the element's only content. `root` and
 * `slot` name the hole's scope (its template's key and its index). `once`: `value` builds static content (a
 * component, an element) and runs once, untracked (`2`: `marker` is the page's data script, not a hole); otherwise a function value is read reactively.
 */
export function hchild(
  parent: Element,
  value: unknown,
  marker?: Node | null,
  root?: Keyed,
  slot?: number,
  once?: 1 | 2,
) {
  const claim = () => {
    const hydrating = keys.hydrating
    let v = once ? untrack(value as () => unknown) : value
    if (!hydrating) return insert(parent, v, marker)
    // One element where a range would be (ssr.ts `hole`): the walk stopped on it, and building it claims it.
    if (once === 1 && marker?.nodeType === 1) {
      // Dev: a hot-swappable component (@kerf/core/hmr) is an accessor, and has to stay live.
      if (DEV && typeof v === 'function') {
        let current: Node[] = [marker]
        let at = marker.nextSibling
        hole(v as () => unknown, (x) => {
          at = current.at(-1)?.nextSibling ?? at
          current = place(parent, x, current, at)
        })
      } else if (v !== marker && v instanceof Node) parent.replaceChild(v, marker)
      keys.hydrating = true
      return
    }
    // Claim the server's nodes on the first run; later runs place values as usual.
    const current = range(parent, marker ?? undefined)
    const at = marker ?? null
    // a fragment's holes must stay live: read flat here, a root `<>{cond && …}</>` would never update
    if (Array.isArray(v) && v.flat(Infinity).some((x) => typeof x === 'function')) {
      const list = v
      v = () => list
    }
    let claimed = false
    const h: Hold = { p: parent, m: at, c: current, t: undefined }
    const put = (x: unknown, was?: unknown) => {
      write(claimed ? x : adopt(x, h.c, { i: 0 }, []), was, h)
      claimed = true
    }
    const done = typeof v !== 'function' ? (put(v), true) : hole(v as () => unknown, put)
    keys.hydrating = true
    if (done && marker?.nodeType === 8) hydration.trash.push(marker as ChildNode) // nothing comes back here
  }
  const miss = keys.miss // a miss inside this hole ends with it: the template around it goes on as it was
  if (keys.on && root?.$k !== undefined) under(`${root.$k}.${slot}/`, claim)
  else claim()
  keys.miss = miss
}
