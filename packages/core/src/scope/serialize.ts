import { DEV } from '../index/graph'
import type { App, report as scopeReport } from '../scope'

/** Dev-only S010: the first value JSON would silently change (a Date, Map, class instance, function, NaN). */
export function unserializable(v: unknown, path: string): string | void {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return
  if (typeof v === 'number') return Number.isFinite(v) ? undefined : `${path} is ${v}`
  if (typeof v !== 'object') return `${path} is a ${typeof v}`
  const proto = Object.getPrototypeOf(v)
  if (!Array.isArray(v) && proto !== Object.prototype && proto !== null)
    return `${path} is a ${v.constructor?.name ?? 'class instance'}`
  for (const [k, x] of Object.entries(v)) {
    const bad = unserializable(x, `${path}.${k}`)
    if (bad) return bad
  }
}

/**
 * The state payload (research 29 §2): each scope's named boxes that differ from `init`. Unnamed boxes are private to
 * their setup, and the setup's own resources own some. Query values aren't boxes here: they travel in the query cache.
 */
export function dehydrateState(
  app: App,
  report: typeof scopeReport,
): Record<string, Record<string, unknown>> | undefined {
  let out: Record<string, Record<string, unknown>> | undefined
  for (const inst of app.instances.values()) {
    for (const box of inst.boxes) {
      const init = inst.inits.get(box)
      if (Object.is(box.v, init)) continue
      const name = box.opts?.name ?? Object.keys(inst.api).find((k) => inst.api[k] === box)
      if (!name) continue
      const bad = DEV && unserializable(box.v, `${inst.name}.${name}`)
      if (bad) {
        report(
          'S010',
          `\`${inst.name}.${name}\` can't go in the page: ${bad}`,
          'keep plain data in it (ids, numbers, strings)',
        )
        continue
      }
      if (JSON.stringify(box.v) === JSON.stringify(init)) continue
      ;((out ??= {})[inst.name] ??= {})[name] = box.v
    }
  }
  return out
}

export function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.freeze(v)
    for (const x of Object.values(v)) deepFreeze(x)
  }
  return v
}
