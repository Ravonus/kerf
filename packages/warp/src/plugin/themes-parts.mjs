// Validate the resting Button inputs with mapped themed CSS consumers.
import { lengthValue } from './themes-system-more.mjs'
const bad = (path, message) => Object.assign(new Error(message), { path })
const plain = (value) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
const dimensions = { gap: 'space', paddingInline: 'space', borderWidth: 'space', radius: 'radius' }
const suffix = {
  gap: 'gap',
  paddingInline: 'padding-inline',
  borderWidth: 'border-width',
  radius: 'radius',
}

/** Validate and emit the non-colour Button inputs that have themed CSS readers. */
export function partInputs(parts, system) {
  if (parts === undefined) return ''
  if (!plain(parts)) throw bad('parts', 'must be a plain object')
  const out = []
  for (const [part, value] of Object.entries(parts)) {
    if (part !== 'button') throw bad(`parts.${part}`, 'unsupported part')
    if (!plain(value)) throw bad('parts.button', 'must be a plain object')
    for (const [key, item] of Object.entries(value)) {
      const path = `parts.button.${key}`
      if (key === 'bg' || key === 'text') continue
      if (Object.hasOwn(dimensions, key)) {
        out.push(
          `--warp-config-part-button-${suffix[key]}:${lengthValue(item, path, dimensions[key], system)}`,
        )
      } else if (key === 'font') {
        if (!plain(item)) throw bad(path, 'must be a plain object')
        for (const [field, input] of Object.entries(item)) {
          const at = `${path}.${field}`
          const name = {
            family: 'family',
            size: 'size',
            weight: 'weight',
            letterSpacing: 'letter-spacing',
          }[field]
          if (!name) throw bad(at, 'unsupported font property')
          let css
          if (field === 'size' || field === 'letterSpacing')
            css = lengthValue(input, at, 'space', system)
          else if (field === 'weight') {
            if (typeof input !== 'number' || !Number.isFinite(input) || input < 1 || input > 1000)
              throw bad(at, 'must be a font weight from 1 to 1000')
            css = String(input)
          } else {
            if (typeof input !== 'string' || !input.trim() || /[;{}<>]/.test(input))
              throw bad(at, 'must be a font family')
            css = input
          }
          out.push(`--warp-config-part-button-font-${name}:${css}`)
        }
      } else throw bad(path, 'unknown property or unsupported state')
    }
  }
  return out.join(';')
}
