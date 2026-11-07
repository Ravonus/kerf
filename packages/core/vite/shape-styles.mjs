import { emitGroups } from '../node/css.mjs'

/** CSS for the compiler's static group facts, without importing application code. */
export function shapeGroupCss(facts, imported, file, options = {}) {
  const groups = new Map()
  for (const group of [...(facts.groups ?? []), ...Object.values(imported ?? {})]) {
    if (!groups.has(group.name)) groups.set(group.name, { ...group, file })
  }
  return emitGroups([...groups.values()], facts.groupUses ?? [], options)
}
