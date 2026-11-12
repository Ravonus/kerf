// The project's view of partial hydration (PLAN §11). Each file's compile reports its top-level bindings, what they read
// and their component call sites (hydration.rs); this follows those across files and says which bindings need the
// client, and so which call sites in the rest are islands. It only ever errs one way: a binding it can't see through
// ships, which costs bytes, and nothing it calls static was seen doing anything a client would have to repeat.
//
//   client   a handler, `ref` or spread on an element, an `import()` outside a handler, a top-level side effect, `@kerf client`,
//            or a read of anything that is: kerf's reactive API, a query, a binding that made a box. A component's handler prop passed on, or its props
//            spread, doesn't count while tags are all that reach it (hydration.rs): only a call site can put anything there
//   island   a call site of a client component (or one given a handler, or a spread of something else) from code that isn't
//
// A caller stays on the client when a site's prop is a function over its local names, or a spread: `$iN` can't hold it
// and JSON can't carry it. That is how a route falls back to hydrating whole, as every route did before.
//
// Then when each island loads, from everything it reaches. Waiting is the default and has to be earned the other way
// round from above: only what is seen doing nothing without an event may wait for one.
//
//   interaction  handlers and nothing else: every change starts with an event, and events replay. `@kerf interaction` says
//                so of work that starts by itself but only matters to someone using it, where the compiler can't prove it
//   visible      work that starts by itself but stays inside the island (`onMount` with `SAFE` globals only), or server
//                data that can move on; `@kerf visible` says so where the compiler can't prove it
//   load         anything else: `@kerf client`, `autofocus`, a `ref` that does work, a module that runs as it loads, a
//                box at module level (a write elsewhere couldn't reach an island that isn't there), code it can't see

import { gather } from './hydration/graph.mjs'
import { bindings } from './hydration/bindings.mjs'
import { classify } from './hydration/classify.mjs'
import { buildReport } from './hydration/report.mjs'
import { reach } from './hydration/reach.mjs'

/**
 * @param {object} o
 * @param {string[]} o.entries route and layout files
 * @param {(source: string, options: object) => any} o.transform the compiler
 * @param {(spec: string, from: string) => Promise<string | undefined>} o.resolve
 * @param {(file: string) => string} o.rel a file's project-relative path, its islands' id
 * @param {Map} [o.cache] file → { mtime, facts }, kept between runs
 * @param {boolean} [o.lazy] islands may wait for the page to need them (default true)
 */
export async function solve({ entries, transform, resolve, rel, cache = new Map(), lazy = true }) {
  const mods = await gather(entries, transform, resolve, cache)
  const { exported, local, tagOf } = bindings(mods)
  const { client, all, isClient, interactive, hoist, inner } = classify(mods, local, tagOf)
  // A call site no route can render is never an island (hydration/reach.mjs).
  const reached = reach(entries, mods, local, tagOf)
  const sites = (n) => (reached.has(n) ? inner(n) : [])
  return buildReport(
    entries,
    lazy,
    mods,
    exported,
    local,
    client,
    all,
    isClient,
    interactive,
    hoist,
    sites,
    rel,
  )
}
