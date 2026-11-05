export function classify(mods, local, tagOf) {
  const client = new Map() // node → why
  const all = [...mods.values()].flatMap((m) => m.facts.nodes)
  const loose = looseNodes(mods, local)
  const isClient = (t) => t === true || (t && typeof t === 'object' && client.has(t))
  markInitial(all, loose, client)
  const interactive = (n, s) => s.handler || isClient(tagOf(n.mod, s))
  const reads = (n, names) => {
    for (const u of names) {
      const t = local(n.mod, u, new Set())
      if (isClient(t?.ns ? true : t)) return `reads \`${u}\``
    }
  }
  /** Sites inside a hoisted site's children: they run on the client with it. */
  const hoist = (n, s) =>
    s.kids.present &&
    !!(
      s.kids.own ||
      s.kids.sites.some((i) =>
        interactive(
          n,
          n.sites.find((x) => x.index === i),
        ),
      )
    )
  const inner = (n) => {
    const skip = new Set()
    for (const s of n.sites)
      if (!skip.has(s.index) && interactive(n, s) && hoist(n, s))
        for (const i of s.kids.sites) skip.add(i)
    return n.sites.filter((s) => !skip.has(s.index))
  }
  const why = (n) => {
    const own = reads(n, n.uses)
    if (own) return own
    for (const s of inner(n)) {
      if (!interactive(n, s)) {
        const hit =
          reads(n, [...s.attrs.flatMap((a) => a.uses), ...s.kids.uses]) ??
          s.attrs.find((a) => a.own)?.own ??
          s.kids.own
        if (hit) return hit
        continue
      }
      if (!s.tag) return `a handler on a tag only known at run time (line ${s.line})`
      for (const a of s.attrs) {
        if (a.kind === 'closure')
          return `prop \`${a.name}\` of <${s.tag}> is a function over local names (line ${s.line})`
        if (a.kind === 'spread') return `a spread on <${s.tag}> (line ${s.line})`
        if (a.kind === 'value') {
          const hit = reads(n, a.uses)
          if (hit) return hit
        }
      }
      if (s.kids.present && hoist(n, s) && !s.kids.closed)
        return `the children of <${s.tag}> need the client and read local names (line ${s.line})`
      if (s.kids.present && !hoist(n, s)) {
        const hit = reads(n, s.kids.uses)
        if (hit) return hit
      }
    }
  }
  for (let grew = true; grew;) {
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

  return { client, all, isClient, interactive, hoist, inner }
}

function looseNodes(mods, local) {
  // Read as a value, a component could be called with anything. A module-level value passes that on to what it holds.
  const loose = new Set()
  const free = (t) => {
    if (t?.ns) t.ns.facts.nodes.forEach(free)
    else if (t && typeof t === 'object' && !loose.has(t)) {
      loose.add(t)
      if (t.value) for (const u of t.uses) free(local(t.mod, u, new Set()))
    }
  }
  for (const m of mods.values()) for (const u of m.facts.loose) free(local(m, u, new Set()))
  return loose
}

function markInitial(all, loose, client) {
  for (const n of all) {
    if (n.force === 'static') continue
    const why =
      n.force === 'client'
        ? '`@weft client`'
        : (n.own ??
          (loose.has(n) ? n.passes : null) ??
          (n.mod.facts.effects && `the module runs ${n.mod.facts.effects} as it loads`))
    if (why) client.set(n, why)
  }
}
