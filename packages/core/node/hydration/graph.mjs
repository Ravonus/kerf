import { readFileSync, statSync } from 'node:fs'
import { OPAQUE, CODE, isServer } from './shared.mjs'

export async function gather(entries, transform, resolve, cache) {
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
    const mod = {
      file,
      facts,
      nodes: new Map(facts.nodes.map((n) => [n.name, n])),
      imports: new Map(facts.imports.map((i) => [i.local, i])),
      resolved: new Map(),
    }
    for (const n of facts.nodes) n.mod = mod
    mods.set(file, mod)
    if (isServer(file)) continue
    for (const i of facts.imports) await follow(mod, i.source)
    for (const e of facts.exports) if (e.source) await follow(mod, e.source)
    for (const s of facts.stars) await follow(mod, s)
    for (const s of facts.side ?? []) await follow(mod, s)
  }

  // An import for its effects counts only if what it runs has some: veneer's `./styles` is nothing but CSS.
  const effect = (mod, seen = new Set()) => {
    if (mod.facts.effects) return mod.facts.effects
    if (seen.has(mod)) return undefined
    seen.add(mod)
    for (const s of mod.facts.side ?? []) {
      const m = mods.get(mod.resolved.get(s))
      if (!m || effect(m, seen)) return `\`import "${s}"\``
    }
  }
  const found = [...mods.values()].map((m) => [m, effect(m)])
  for (const [m, why] of found) m.facts = { ...m.facts, effects: why }

  return mods
}

function external(spec, file) {
  return (
    file.includes('/node_modules/') &&
    !/\/node_modules\/@kerf-js\//.test(file) &&
    !spec.startsWith('.')
  )
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
    if (code && !out.diagnostics?.some((d) => d.code === 'W000')) facts = out.facts.hydration
  } catch {}
  // Mid-edit a file may not parse: what it was is a better guess than nothing, which would look static.
  if (!facts) return hit && structuredClone(hit.facts)
  cache.set(file, { mtime, facts })
  return structuredClone(facts)
}
