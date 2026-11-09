// Validate part inputs with readers in the themed stylesheets.
import { lengthValue, shadowValue } from './themes-system-more.mjs'
const bad = (path, message) => Object.assign(new Error(message), { path })
const plain = (value) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
const properties = {
  button: ['gap', 'paddingInline', 'borderWidth', 'radius', 'font', 'shadow', 'duration'],
  nav: ['gap', 'underline'],
  tabs: ['gap', 'underline'],
  link: ['underline'],
  pill: ['gap', 'height', 'paddingInline', 'borderWidth', 'radius', 'font'],
  field: ['gap', 'radius'],
  card: ['gap', 'padding', 'radius', 'shadow'],
}
const states = {
  button: { hover: ['shadow'], press: ['shadow', 'scale'] },
  pill: { hover: ['gap'], active: ['gap'] },
  card: { hover: ['shadow'] },
}
const hyphen = (value) => value.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

function scalar(value, path, key, system) {
  if (key === 'shadow') return shadowValue(value, path)
  if (key === 'scale' || key === 'weight' || key === 'lineHeight') {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < 0 ||
      (key === 'weight' && (value < 1 || value > 1000))
    )
      throw bad(path, 'invalid numeric value')
    return String(value)
  }
  if (key === 'duration') {
    const css =
      typeof value === 'number' && Number.isFinite(value) && value >= 0 ? `${value}ms` : value
    if (typeof css !== 'string' || !/^(?:\d+(?:\.\d+)?|\.\d+)(?:ms|s)$/.test(css))
      throw bad(path, 'must be a nonnegative duration')
    return css
  }
  if (key === 'family') {
    if (typeof value !== 'string' || !value.trim() || /[;{}<>]/.test(value))
      throw bad(path, 'must be a font family')
    return value
  }
  return lengthValue(value, path, key === 'radius' ? 'radius' : 'space', system)
}

function leaves(part, values, system, state = 'rest') {
  const out = []
  const allowed = state === 'rest' ? properties[part] : states[part]?.[state]
  if (!allowed || !plain(values))
    throw bad(`parts.${part}.${state}`, 'unsupported state or non-object')
  for (const [key, value] of Object.entries(values)) {
    const path = `parts.${part}.${state === 'rest' ? '' : `${state}.`}${key}`
    if (part === 'button' && state === 'rest' && (key === 'bg' || key === 'text')) continue
    if (!allowed.includes(key)) throw bad(path, 'unknown property or unsupported state')
    if (key === 'font' || key === 'underline') {
      if (!plain(value)) throw bad(path, 'must be a plain object')
      const fields =
        key === 'font'
          ? part === 'pill'
            ? ['family', 'size', 'weight', 'lineHeight']
            : ['family', 'size', 'weight', 'letterSpacing']
          : part === 'link'
            ? ['width', 'offset']
            : ['width']
      for (const [field, input] of Object.entries(value)) {
        if (!fields.includes(field)) throw bad(`${path}.${field}`, 'unsupported property')
        out.push(
          `--warp-config-part-${part}-${hyphen(key)}-${hyphen(field)}:${scalar(input, `${path}.${field}`, field, system)}`,
        )
      }
    } else
      out.push(
        `--warp-config-part-${part}-${hyphen(key)}${state === 'rest' ? '' : `-${state}`}:${scalar(value, path, key, system)}`,
      )
  }
  return out
}

/** Validate and emit only part properties with mapped CSS readers. */
export function partInputs(parts, system) {
  if (parts === undefined) return ''
  if (!plain(parts)) throw bad('parts', 'must be a plain object')
  const out = []
  for (const [part, value] of Object.entries(parts)) {
    if (!Object.hasOwn(properties, part)) throw bad(`parts.${part}`, 'unsupported part')
    if (!plain(value)) throw bad(`parts.${part}`, 'must be a plain object')
    const rest = {}
    for (const [key, item] of Object.entries(value)) {
      if (['hover', 'press', 'active'].includes(key)) out.push(...leaves(part, item, system, key))
      else rest[key] = item
    }
    out.push(...leaves(part, rest, system))
  }
  return out.join(';')
}
