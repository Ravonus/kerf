// The project's view of partial hydration (PLAN §11). Each file's compile reports its top-level bindings, what they read
// and their component call sites (hydration.rs); this follows those across files and says which bindings need the
// client, and so which call sites in the rest are islands. It only ever errs one way: a binding it can't see through
// ships, which costs bytes, and nothing it calls static was seen doing anything a client would have to repeat.
//
//   client   a handler or `ref` on an element, a top-level side effect, `@weft client`, or a read of anything that is:
//            weft's reactive API, a query, a binding that made a box
//   island   a call site of a client component (or one given a handler) from code that isn't
//
// A caller stays on the client when a site's prop is a function over its local names, or a spread: `$iN` can't hold it
// and JSON can't carry it. That is how a route falls back to hydrating whole, as every route did before.
//
// Then when each island loads, from everything it reaches. Waiting is the default and has to be earned the other way
// round from above: only what is seen doing nothing without an event may wait for one.
//
//   interaction  handlers and nothing else: every change starts with an event, and events replay
//   visible      work that starts by itself but stays inside the island (`onMount` with `SAFE` globals only), or server
//                data that can move on; `@weft visible` says so where the compiler can't prove it
//   load         anything else: `@weft client`, `autofocus`, a `ref` that does work, a module that runs as it loads, a
//                box at module level (a write elsewhere couldn't reach an island that isn't there), code it can't see

import { readFileSync, statSync } from 'node:fs'

const PURE = { '@weft-js/core': new Set(['For', 'mergeProps']), '@weft-js/start': new Set(['Link']) }
const OPAQUE = /^(weft|@weft-js\/start)(\/|$)/
const CODE = /\.[cm]?[jt]sx?$/
/** weft API that needs nothing from the page and starts nothing by itself. */
const QUIET = {
  '@weft-js/core': new Set(['state', 'derived', 'memo', 'untrack', 'batch', 'flush', 'onCleanup', 'For', 'mergeProps', 'name', 'getOwner', 'view', 'omit', 'restOf']),
  '@weft-js/core/style': { has: () => true },
  '@weft-js/start': new Set(['Link', 'Form']),
}
const STARTS = new Set(['onMount', 'watch', 'effect'])
const DATA = new Set(['resource', 'Boundary'])
const BOXES = new Set(['state', 'derived', 'memo', 'defineState'])
/** Globals work may touch and still be its island's own: nothing here reaches past the island. */
const SAFE = new Set(`Array BigInt Boolean Date Error Infinity IntersectionObserver Intl JSON Map Math MutationObserver NaN Number Object Promise
  RegExp ResizeObserver Set String Symbol WeakMap WeakSet cancelAnimationFrame clearInterval clearTimeout console decodeURI decodeURIComponent encodeURI encodeURIComponent isFinite isNaN matchMedia parseFloat parseInt
  performance queueMicrotask requestAnimationFrame setInterval setTimeout structuredClone undefined`.split(/\s+/))
const isServer = f => /\/src\/server\//.test(f) || /\.server\.[cm]?[jt]sx?$/.test(f)

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
  const mods = new Map()
  const queue = [...entries]
  const follow = async (mod, spec) => {
    if (OPAQUE.test(spec)) return undefined
    const key = spec
    if (mod.resolved.has(key)) return mod.resolved.get(key)
    const file = (await resolve(spec, mod.file))?.replace(/\?.*$/, '')
    mod.resolved.set(key, file)
    if (file && CODE.test(file) && !mods.has(file) && !external(spec, file)) queue.push(file)
    return file
  }
  while (queue.length) {
    const file = queue.pop()
    if (mods.has(file)) continue
    const facts = read(file, transform, cache)
    if (!facts) continue
    const mod = { file, facts, nodes: new Map(facts.nodes.map(n => [n.name, n])), imports: new Map(facts.imports.map(i => [i.local, i])), resolved: new Map() }
    for (const n of facts.nodes) n.mod = mod
    mods.set(file, mod)
    if (isServer(file)) continue
    for (const i of facts.imports) await follow(mod, i.source)
    for (const e of facts.exports) if (e.source) await follow(mod, e.source)
    for (const s of facts.stars) await follow(mod, s)
    for (const s of facts.side ?? []) await follow(mod, s)
  }

  // An import for its effects counts only if what it runs has some: warp's `./styles` is nothing but CSS.
  const effect = (mod, seen = new Set()) => {
    if (mod.facts.effects) return mod.facts.effects
    if (seen.has(mod)) return undefined
    seen.add(mod)
    for (const s of mod.facts.side ?? []) {
      const m = mods.get(mod.resolved.get(s))
      if (!m || effect(m, seen)) return `\`import "${s}"\``
    }
  }
  const found = [...mods.values()].map(m => [m, effect(m)])
  for (const [m, why] of found) m.facts = { ...m.facts, effects: why }

  /** What `name` in `mod` is: a node, `true` (needs the client), or `false` (needs nothing). */
  const exported = (mod, name, seen = new Set()) => {
    if (seen.has(mod.file + name)) return true
    seen.add(mod.file + name)
    if (isServer(mod.file)) return true
    const e = mod.facts.exports.find(x => x.exported === name)
    if (e?.source) return e.imported === '*' ? true : across(mod, e.source, e.imported, seen)
    if (e) return local(mod, e.local, seen)
    for (const star of mod.facts.stars) {
      const file = mod.resolved.get(star)
      const m = file && mods.get(file)
      if (m && (m.facts.exports.some(x => x.exported === name) || m.facts.stars.length)) {
        const hit = exported(m, name, seen)
        if (hit !== undefined) return hit
      }
    }
    return mod.facts.stars.length ? undefined : false // a name nothing exports is a type
  }
  const local = (mod, name, seen) => {
    const n = mod.nodes.get(name)
    if (n) return n
    const i = mod.imports.get(name)
    return i ? across(mod, i.source, i.imported, seen) : false
  }
  const across = (mod, spec, name, seen) => {
    if (spec === '@weft-js/core/style') return false
    if (OPAQUE.test(spec)) return !PURE[spec]?.has(name)
    const file = mod.resolved.get(spec)
    if (!file) return true
    if (!CODE.test(file)) return false
    const m = mods.get(file)
    if (m) return name === '*' ? { ns: m } : exported(m, name, seen)
    // A package nothing reads the source of: its functions are plain, its components unknown.
    return /^[A-Z]/.test(name)
  }
  const tagOf = (mod, site) => {
    if (!site.tag) return undefined
    const t = local(mod, site.tag, new Set())
    if (t?.ns) return site.member ? exported(t.ns, site.member) : true
    return t
  }

  const client = new Map() // node → why
  const all = [...mods.values()].flatMap(m => m.facts.nodes)
  const isClient = t => t === true || (t && typeof t === 'object' && client.has(t))
  for (const n of all) {
    if (n.force === 'static') continue
    const why = n.force === 'client' ? '`@weft client`' : n.own ?? (n.mod.facts.effects && `the module runs ${n.mod.facts.effects} as it loads`)
    if (why) client.set(n, why)
  }
  const interactive = (n, s) => s.handler || isClient(tagOf(n.mod, s))
  const reads = (n, names) => {
    for (const u of names) {
      const t = local(n.mod, u, new Set())
      if (isClient(t?.ns ? true : t)) return `reads \`${u}\``
    }
  }
  /** Sites inside a hoisted site's children: they run on the client with it. */
  const hoist = (n, s) => s.kids.present && !!(s.kids.own || s.kids.sites.some(i => interactive(n, n.sites.find(x => x.index === i))))
  const inner = n => {
    const skip = new Set()
    for (const s of n.sites) if (!skip.has(s.index) && interactive(n, s) && hoist(n, s)) for (const i of s.kids.sites) skip.add(i)
    return n.sites.filter(s => !skip.has(s.index))
  }
  const why = n => {
    const own = reads(n, n.uses)
    if (own) return own
    for (const s of inner(n)) {
      if (!interactive(n, s)) {
        const hit = reads(n, [...s.attrs.flatMap(a => a.uses), ...s.kids.uses]) ?? s.attrs.find(a => a.own)?.own ?? s.kids.own
        if (hit) return hit
        continue
      }
      if (!s.tag) return `a handler on a tag only known at run time (line ${s.line})`
      for (const a of s.attrs) {
        if (a.kind === 'closure') return `prop \`${a.name}\` of <${s.tag}> is a function over local names (line ${s.line})`
        if (a.kind === 'spread') return `a spread on <${s.tag}> (line ${s.line})`
        if (a.kind === 'value') {
          const hit = reads(n, a.uses)
          if (hit) return hit
        }
      }
      if (s.kids.present && hoist(n, s) && !s.kids.closed) return `the children of <${s.tag}> need the client and read local names (line ${s.line})`
      if (s.kids.present && !hoist(n, s)) {
        const hit = reads(n, s.kids.uses)
        if (hit) return hit
      }
    }
  }
  for (let grew = true; grew; ) {
    grew = false
    for (const n of all) {
      if (client.has(n) || n.force === 'static') continue
      const w = why(n)
      if (w) {
        client.set(n, w)
        grew = true
      }
    }
  }

  /** When an island may load: `when` (`v`, `i`, or none for the page's load), `why`, and `fix` when it's avoidable. */
  const timing = (n, s) => {
    const seen = new Set()
    const at = o => `${o.name} (${rel(o.mod.file)}:${o.line})`
    let start, data, forced, stop
    const halt = (why, fix) => { stop ??= { why, fix } }
    const look = (owner, names) => {
      for (const u of names) {
        const i = owner.mod.imports.get(u)
        if (i && OPAQUE.test(i.source)) {
          if (i.source === '@weft-js/core' && STARTS.has(i.imported)) start ??= `\`${i.imported}\` in ${at(owner)}`
          else if (i.source === '@weft-js/core' && DATA.has(i.imported)) data ??= `\`${i.imported}\` in ${at(owner)}`
          else if (i.source === '@weft-js/core' && BOXES.has(i.imported)) {
            if (owner.value) halt(`\`${owner.name}\` is a box at module level (${at(owner)}): a write from outside couldn't reach an island that isn't running`, `make the box inside the component, or pass it down from one that runs: nothing else keeps this island from waiting`)
          } else if (!QUIET[i.source]?.has(i.imported)) halt(`\`${i.imported}\` from ${i.source} in ${at(owner)} isn't known to wait`, `\`/* @weft visible */\` above ${owner.name}, when it does nothing until it's on screen`)
          continue
        }
        const file = i && owner.mod.resolved.get(i.source)
        if (file && isServer(file)) {
          if (owner.calls.includes(u)) data ??= `\`${u}()\` in ${at(owner)}`
          continue
        }
        const t = local(owner.mod, u, new Set())
        if (t?.ns) t.ns.facts.nodes.forEach(visit)
        else if (t === true) halt(`\`${u}\` in ${at(owner)} is code the compiler can't see into`, `\`/* @weft visible */\` above ${owner.name}, when it does nothing until it's on screen`)
        else if (t) visit(t)
      }
    }
    const site = (owner, x) => {
      look(owner, x.attrs.flatMap(a => a.uses))
      look(owner, x.kids.uses)
      if (x.tag) look(owner, [x.tag])
    }
    const visit = o => {
      if (seen.has(o)) return
      seen.add(o)
      if (o.force === 'visible') return void (forced = o)
      if (o.force === 'static') return
      if (o.force === 'client') return halt(`\`@weft client\` on ${at(o)}`)
      if (o.early) halt(`${o.early} in ${at(o)}`, o.early.startsWith('`autofocus') ? undefined : `keep the \`ref\` to storing the node, and do the work in a handler`)
      if (o.mod.facts.effects) halt(`${rel(o.mod.file)} runs ${o.mod.facts.effects} as it loads`, `move that into a function an island calls`)
      look(o, o.uses)
      for (const x of o.sites) site(o, x)
    }
    site(n, s)
    if (stop) return stop
    const away = [...seen].flatMap(o => o.globals).filter(g => !SAFE.has(g))
    if (start && away.length) return { why: `${start} can reach \`${away[0]}\`, past the island`, fix: `\`/* @weft visible */\` above the component, when that only matters once it's on screen` }
    if (forced) return { when: 'v', why: `\`@weft visible\` on ${at(forced)}` }
    if (start) return { when: 'v', why: `${start} stays inside the island` }
    if (data) return { when: 'v', why: `${data} reads server data` }
    return { when: 'i', why: 'handlers only: nothing happens before an event' }
  }

  const NAMES = { v: 'visible', i: 'interaction' }
  const files = new Map()
  const islands = []
  const loads = []
  const diagnostics = []
  for (const mod of mods.values()) {
    if (isServer(mod.file)) continue
    const sites = []
    for (const n of mod.facts.nodes) {
      if (client.has(n)) continue
      for (const s of inner(n)) {
        if (!interactive(n, s) || !s.tag) continue
        const hoisted = hoist(n, s)
        const id = `${rel(mod.file)}#${s.index}`
        const t = lazy ? timing(n, s) : { why: 'hydration: partial' }
        sites.push({ index: s.index, hoist: hoisted, when: t.when ?? '' })
        islands.push({ id, file: mod.file, index: s.index })
        loads.push({ id, tag: s.member ?? s.tag, line: s.line, when: NAMES[t.when] ?? 'load', why: t.why })
        if (t.fix) diagnostics.push({ code: 'H010', file: rel(mod.file), line: s.line, why: `<${s.member ?? s.tag}> has to load with the page: ${t.why}`, fix: t.fix })
      }
    }
    if (sites.length) files.set(mod.file, { id: rel(mod.file), sites })
  }
  const defaultOf = file => {
    const m = mods.get(file)
    return m ? exported(m, 'default') : true
  }
  const statics = new Set(entries.filter(f => !isClient(defaultOf(f))))
  const report = [...mods.values()].filter(m => !isServer(m.file)).map(m => ({
    file: rel(m.file),
    nodes: m.facts.nodes.filter(n => n.sites.length || /^[A-Z]/.test(n.name)).map(n => ({ name: n.name, line: n.line, client: client.get(n) ?? null })),
  })).filter(f => f.nodes.length)
  return { files, islands, loads, diagnostics, statics, report, stamps: [...mods.keys()] }
}

function external(spec, file) {
  return file.includes('/node_modules/') && !/\/node_modules\/@weft-js\//.test(file) && !spec.startsWith('.')
}

function read(file, transform, cache) {
  const mtime = statSync(file, { throwIfNoEntry: false })?.mtimeMs
  if (mtime === undefined) return undefined
  const hit = cache.get(file)
  if (hit?.mtime === mtime) return structuredClone(hit.facts)
  let facts
  try {
    const code = readFileSync(file, 'utf8')
    const out = transform(code, { filename: file, checkOnly: true })
    if (code && !out.diagnostics?.some(d => d.code === 'W000')) facts = out.facts.hydration
  } catch {}
  // Mid-edit a file may not parse: what it was is a better guess than nothing, which would look static.
  if (!facts) return hit && structuredClone(hit.facts)
  cache.set(file, { mtime, facts })
  return structuredClone(facts)
}
