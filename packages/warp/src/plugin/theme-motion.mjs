// `system.duration` and `system.ease`: warp's steps and curves, and any the app names. An app's token is exact (no
// dial rescales it), and a part's `duration` or `easing` can name it.
import { NAME, bad, safe } from './theme-values.mjs'

const OWN = {
  duration: ['instant', 'fast', 'base', 'slow'],
  ease: ['in', 'out', 'in-out', 'pop', 'spring', 'sheet'],
}
const KIND = { time: 'duration', ease: 'ease' }

export function motionToken(group, key, { tokenNames, at }) {
  const token = `--warp-${group}-${key}`
  if (OWN[group].includes(key) || (NAME.test(key) && !tokenNames.has(token))) return token
  throw bad(at, `unknown step; use ${OWN[group].join(', ')} or a lowercase name of your own`)
}

/** A motion value as CSS: a number of ms, `[x1, y1, x2, y2]` handles for cubic-bezier(), or as written. */
export function motionValue(group, v, at) {
  if (Array.isArray(v)) {
    const x = (n) => Number.isFinite(n) && n >= 0 && n <= 1
    if (group !== 'ease' || v.length !== 4 || !v.every(Number.isFinite) || !x(v[0]) || !x(v[2]))
      throw bad(at, 'must be cubic-bezier handles [x1, y1, x2, y2], x1 and x2 from 0 to 1')
    return `cubic-bezier(${v.join(', ')})`
  }
  if (!safe(v)) throw bad(at, 'must be a CSS value or a number')
  return group === 'duration' && Number.isFinite(v) ? `${v}ms` : String(v)
}

export function motionNames(...systems) {
  const names = { duration: new Set(OWN.duration), ease: new Set(OWN.ease) }
  for (const system of systems)
    for (const group of ['duration', 'ease'])
      for (const key of Object.keys(system?.[group] ?? {})) names[group].add(key)
  return names
}

// a part's duration or easing: a declared name reads its token, anything else is a value
export function motionRef(kind, v, { names, at }) {
  const group = KIND[kind]
  return typeof v === 'string' && names[group].has(v)
    ? `var(--warp-${group}-${v})`
    : motionValue(group, v, at)
}
