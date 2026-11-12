// Which top-level bindings the routes can render: each route and layout file's own, then whatever those read, call or
// render, across imports and barrels by name. Only these hold islands. A barrel names every component of a package,
// and a call site in one nothing renders would still get its island, its chunk and that chunk's CSS on every page.
//
// It errs the same way as the rest: what it can't follow by name keeps a whole module. A namespace keeps every binding
// of its module, a module that runs as it loads keeps all of its own, and a name read as a value (`loose`) is kept
// wherever the module that reads it loads.
export function reach(entries, mods, local, tagOf) {
  const nodes = new Set()
  const loaded = new Set()
  const whole = new Set()
  const queue = []
  const named = (mod, name) => add(local(mod, name, new Set()))
  const add = (t) => {
    if (t?.ns) keep(t.ns)
    else if (t && typeof t === 'object' && !nodes.has(t)) {
      nodes.add(t)
      queue.push(t)
      load(t.mod)
    }
  }
  const linked = (mod, spec) => mods.get(mod.resolved.get(spec))
  const load = (mod) => {
    if (!mod || loaded.has(mod)) return
    loaded.add(mod)
    if (mod.facts.effects) keep(mod)
    for (const u of mod.facts.loose) named(mod, u)
    for (const s of mod.facts.side ?? []) load(linked(mod, s))
  }
  const keep = (mod) => {
    if (!mod || whole.has(mod)) return
    whole.add(mod)
    load(mod)
    for (const n of mod.facts.nodes) add(n)
    for (const e of mod.facts.exports) if (e.source) keep(linked(mod, e.source))
    for (const s of mod.facts.stars) keep(linked(mod, s))
  }
  // `export * as K` makes a name of a whole module, which the bindings don't follow: it is kept wherever it is
  for (const m of mods.values())
    for (const e of m.facts.exports) if (e.source && e.imported === '*') keep(linked(m, e.source))
  for (const file of entries) keep(mods.get(file))
  while (queue.length) {
    const n = queue.pop()
    for (const u of [...n.uses, ...n.calls]) named(n.mod, u)
    for (const s of n.sites) {
      add(tagOf(n.mod, s))
      for (const a of s.attrs) for (const u of a.uses) named(n.mod, u)
      for (const u of s.kids.uses) named(n.mod, u)
    }
  }
  return nodes
}
