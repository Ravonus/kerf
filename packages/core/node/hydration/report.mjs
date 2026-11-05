import { isServer } from './shared.mjs'
import { timing } from './timing.mjs'

export function buildReport(
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
  inner,
  rel,
) {
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
        const t = lazy ? timing(n, s, local, rel) : { why: 'hydration: partial' }
        sites.push({ index: s.index, hoist: hoisted, when: t.when ?? '' })
        islands.push({ id, file: mod.file, index: s.index })
        loads.push({
          id,
          tag: s.member ?? s.tag,
          line: s.line,
          when: NAMES[t.when] ?? 'load',
          why: t.why,
        })
        if (t.fix)
          diagnostics.push({
            code: 'H010',
            file: rel(mod.file),
            line: s.line,
            why: `<${s.member ?? s.tag}> has to load with the page: ${t.why}`,
            fix: t.fix,
          })
      }
    }
    if (sites.length) files.set(mod.file, { id: rel(mod.file), sites })
  }
  // A closure can't reach an island, so all of its caller runs in the browser, and nothing but the report says so.
  for (const n of all) {
    const w = client.get(n)
    if (w?.includes('is a function over local names') && !n.mod.file.includes('/node_modules/'))
      diagnostics.push({
        code: 'H017',
        file: rel(n.mod.file),
        line: n.line,
        why: `${n.name} has to hydrate whole: ${w}`,
        fix: `nothing, when ${n.name} is mostly controls; otherwise move each control and what its function reads into a small component of its own, which becomes the island and leaves the rest static`,
      })
  }
  const defaultOf = (file) => {
    const m = mods.get(file)
    return m ? exported(m, 'default') : true
  }
  const statics = new Set(entries.filter((f) => !isClient(defaultOf(f))))
  const report = [...mods.values()]
    .filter((m) => !isServer(m.file))
    .map((m) => ({
      file: rel(m.file),
      nodes: m.facts.nodes
        .filter((n) => n.sites.length || /^[A-Z]/.test(n.name))
        .map((n) => ({ name: n.name, line: n.line, client: client.get(n) ?? null })),
    }))
    .filter((f) => f.nodes.length)
  return { files, islands, loads, diagnostics, statics, report, stamps: [...mods.keys()] }
}
