// Slot table (research 13 §2.2) and the binding rules, resolved from config data alone. Phase 1 executes no plugin.

export const slotTable = [
  { id: 'font.build', version: 1, cardinality: 'one', sides: ['build'], default: null, phase: '2' },
  { id: 'media.build', version: 1, cardinality: 'one', sides: ['build'], default: null, phase: '2' },
  { id: 'media.encode', version: 1, cardinality: 'keyed', sides: ['build', 'server'], default: null, phase: '3c' },
  { id: 'media.server', version: 1, cardinality: 'one', sides: ['server'], default: null, phase: '3' },
  { id: 'text.measure', version: 1, cardinality: 'one', sides: ['client', 'worker'], default: null, phase: '2 (Surfaces)' },
  { id: 'surface.renderer', version: 1, cardinality: 'keyed', sides: ['client'], default: ['canvas2d', 'webgl2'], phase: '2 (Surfaces)' },
  { id: 'realtime.bus', version: 1, cardinality: 'one', sides: ['server'], default: 'memory', phase: '3' },
  { id: 'db.adapter', version: 1, cardinality: 'keyed', sides: ['server'], default: ['drizzle'], phase: '3c' },
  { id: 'server.extension', version: 1, cardinality: 'keyed', sides: ['server'], default: null, phase: '6c' },
  { id: 'pay.rail', version: 1, cardinality: 'keyed', sides: ['server', 'client', 'native'], default: null, phase: '6c' },
]

export function slotDef(id) {
  const def = slotTable.find(s => s.id === id)
  if (def) return def
  if (/^device\.[a-z][\w-]*$/.test(id)) return { id, version: 1, cardinality: 'keyed', sides: ['native', 'client'], default: null, phase: '6b' }
  return undefined
}

/**
 * @param {{ plugins?: Array<{ name: string, provides?: Array<string | { slot: string, key: string }> }>, slots?: Record<string, unknown> }} config
 * @param {(code: string, why: string, near: string) => void} report
 * @returns {Record<string, unknown>} the `slots` block of `weft check --json`
 */
export function bindSlots(config, report) {
  const plugins = config.plugins ?? []
  const chosen = config.slots ?? {}
  const names = new Set(plugins.map(p => p.name))

  /** slot id → key ('' for `one`) → provider names */
  const offers = new Map()
  for (const p of [...plugins].sort((a, b) => a.name.localeCompare(b.name))) {
    for (const item of p.provides ?? []) {
      const { slot, key = '' } = typeof item === 'string' ? { slot: item } : item
      if (!slotDef(slot) && !slot.startsWith(`${p.name}.`)) {
        report('P008', `\`${p.name}\` provides \`${slot}\`, which is not a slot weft defines.`, p.name)
        continue
      }
      const byKey = offers.get(slot) ?? new Map()
      byKey.set(key, [...(byKey.get(key) ?? []), p.name])
      offers.set(slot, byKey)
    }
  }

  for (const [id, pick] of Object.entries(chosen)) {
    if (!slotDef(id) && !offers.has(id)) {
      report('P008', `\`slots\` names \`${id}\`, which is not a slot weft defines.`, id)
      continue
    }
    const picks = typeof pick === 'string' ? { '': pick } : pick
    for (const [key, name] of Object.entries(picks)) {
      if (name.startsWith('weft:default')) continue
      if (!names.has(name)) report('P009', `\`slots['${id}']\` picks \`${name}\`, which is not in \`plugins\`.`, id)
      else if (!(offers.get(id)?.get(key) ?? []).includes(name)) report('P009', `\`slots['${id}']\` picks \`${name}\`, which does not provide it.`, id)
    }
  }

  const ids = [...new Set([...slotTable.map(s => s.id), ...offers.keys()])].sort()
  const out = {}
  for (const id of ids) {
    const def = slotDef(id) ?? { cardinality: 'one', default: null }
    const byKey = offers.get(id) ?? new Map()
    const pick = chosen[id]
    const resolve = (key, fallback) => {
      const providers = byKey.get(key) ?? []
      const named = typeof pick === 'string' ? (key === '' ? pick : undefined) : pick?.[key]
      if (named && (named.startsWith('weft:default') || providers.includes(named))) return named
      if (providers.length === 1) return providers[0]
      if (providers.length > 1) {
        const where = key ? `\`${id}\` key \`${key}\`` : `\`${id}\``
        report('P100', `${where} has ${providers.length} providers: ${providers.join(', ')}. Array order never decides.`, providers[0])
        return null
      }
      return fallback
    }
    if (def.cardinality === 'one') {
      out[id] = resolve('', def.default ? `weft:default:${def.default}` : null)
    } else {
      const keys = new Set([...(def.default ?? []), ...[...byKey.keys()].filter(Boolean)])
      const block = {}
      for (const key of [...keys].sort()) block[key] = resolve(key, def.default?.includes(key) ? 'weft:default' : null)
      out[id] = block
    }
  }
  return out
}
