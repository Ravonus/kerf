// Resolve the supported inherited system inputs before emitting CSS.
import { extraSystemInputs } from './themes-system-more.mjs'
const builtins = {
  space: ['hair', 'tight', 'related', 'group', 'section', 'page'],
  radius: ['control', 'surface', 'mark', 'round'],
}
const aliases = { card: 'surface', pill: 'round' }
const bad = (path, message) => Object.assign(new Error(message), { path })
const plain = (value) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)

/** Validate and emit the space, radius and font scales. */
export function systemInputs(system) {
  if (system === undefined) return ''
  if (!plain(system)) throw bad('system', 'must be a plain object')
  const result = []
  for (const [kind, input] of Object.entries(system)) {
    if (!['space', 'radius', 'font'].includes(kind)) {
      result.push(...extraSystemInputs(kind, input))
      continue
    }
    if (!plain(input)) throw bad(`system.${kind}`, 'must be a plain object')
    const values = {}
    for (const [key, value] of Object.entries(input)) {
      const path = `system.${kind}.${key}`
      if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(key)) throw bad(path, 'invalid scale name')
      const name = kind === 'radius' ? (aliases[key] ?? key) : key
      if (Object.hasOwn(values, name) && values[name] !== value)
        throw bad(path, 'conflicting alias')
      values[name] = value
    }
    const visiting = new Set()
    const resolve = (name) => {
      const value = values[name]
      const path = `system.${kind}.${name}`
      if (visiting.has(name)) throw bad(path, 'cyclic scale reference')
      if (kind === 'font') {
        if (typeof value !== 'string' || !value.trim() || /[;{}<>]/.test(value))
          throw bad(path, 'must be a font family')
        return value
      }
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return `${value}px`
      if (typeof value !== 'string')
        throw bad(path, 'must be a nonnegative length or scale reference')
      if (/^(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|%)$/.test(value)) return value
      const ref = kind === 'radius' ? (aliases[value] ?? value) : value
      if (!Object.hasOwn(values, ref) && !builtins[kind].includes(ref))
        throw bad(path, 'unknown scale reference')
      if (Object.hasOwn(values, ref)) {
        visiting.add(name)
        resolve(ref)
        visiting.delete(name)
      }
      return `var(--warp-config-system-${kind}-${ref},var(--warp-${kind}-${ref}))`
    }
    for (const name of Object.keys(values).sort()) {
      const suffix = kind === 'font' && name === 'body' ? 'sans' : name
      result.push(`--warp-config-system-${kind}-${suffix}:${resolve(name)}`)
    }
  }
  return result.join(';')
}
