import { PURE, OPAQUE, CODE, isServer } from './shared.mjs'

export function bindings(mods) {
  /** What `name` in `mod` is: a node, `true` (needs the client), or `false` (needs nothing). */
  const exported = (mod, name, seen = new Set()) => {
    if (seen.has(mod.file + name)) return true
    seen.add(mod.file + name)
    if (isServer(mod.file)) return true
    const e = mod.facts.exports.find((x) => x.exported === name)
    if (e?.source) return e.imported === '*' ? true : across(mod, e.source, e.imported, seen)
    if (e) return local(mod, e.local, seen)
    for (const star of mod.facts.stars) {
      const file = mod.resolved.get(star)
      const m = file && mods.get(file)
      if (m && (m.facts.exports.some((x) => x.exported === name) || m.facts.stars.length)) {
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

  return { exported, local, tagOf }
}
