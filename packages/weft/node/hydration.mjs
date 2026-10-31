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

import { readFileSync, statSync } from 'node:fs'

const PURE = { weft: new Set(['For', 'mergeProps']), '@weft/start': new Set(['Link']) }
const OPAQUE = /^(weft|@weft\/start)(\/|$)/
const CODE = /\.[cm]?[jt]sx?$/
const isServer = f => /\/src\/server\//.test(f) || /\.server\.[cm]?[jt]sx?$/.test(f)

/**
 * @param {object} o
 * @param {string[]} o.entries route and layout files
 * @param {(source: string, options: object) => any} o.transform the compiler
 * @param {(spec: string, from: string) => Promise<string | undefined>} o.resolve
 * @param {(file: string) => string} o.rel a file's project-relative path, its islands' id
 * @param {Map} [o.cache] file → { mtime, facts }, kept between runs
 */
export async function solve({ entries, transform, resolve, rel, cache = new Map() }) {
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
  }

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
    if (spec === 'weft/style') return false
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

  const files = new Map()
  const islands = []
  for (const mod of mods.values()) {
    if (isServer(mod.file)) continue
    const sites = []
    for (const n of mod.facts.nodes) {
      if (client.has(n)) continue
      for (const s of inner(n)) {
        if (!interactive(n, s) || !s.tag) continue
        const hoisted = hoist(n, s)
        sites.push({ index: s.index, hoist: hoisted })
        islands.push({ id: `${rel(mod.file)}#${s.index}`, file: mod.file, index: s.index })
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
  return { files, islands, statics, report, stamps: [...mods.keys()] }
}

function external(spec, file) {
  return file.includes('/node_modules/') && !/\/node_modules\/@weft\//.test(file) && !spec.startsWith('.')
}

function read(file, transform, cache) {
  const mtime = statSync(file, { throwIfNoEntry: false })?.mtimeMs
  if (mtime === undefined) return undefined
  const hit = cache.get(file)
  if (hit?.mtime === mtime) return structuredClone(hit.facts)
  let facts
  try {
    facts = transform(readFileSync(file, 'utf8'), { filename: file, checkOnly: true }).facts.hydration
  } catch {
    return undefined
  }
  cache.set(file, { mtime, facts })
  return structuredClone(facts)
}
