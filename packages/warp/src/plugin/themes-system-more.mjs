// Validate the text, elevation and motion inputs with themed CSS readers.
const roles = {
  display: ['family', 'size', 'weight', 'lineHeight', 'letterSpacing'],
  title: ['family', 'size', 'weight', 'lineHeight', 'letterSpacing'],
  heading: ['family', 'size', 'weight', 'lineHeight', 'letterSpacing'],
  body: ['family', 'size', 'weight', 'lineHeight'],
  caption: ['size', 'lineHeight'],
  code: ['family', 'size', 'lineHeight'],
  label: ['family', 'size', 'weight', 'lineHeight', 'letterSpacing', 'transform'],
  button: ['family', 'size', 'weight', 'lineHeight', 'letterSpacing', 'transform'],
}
const names = {
  family: 'font',
  lineHeight: 'leading',
  letterSpacing: 'tracking',
  transform: 'case',
}
const elevation = { none: 0, sm: 1, md: 2, lg: 3 }
const bad = (path, message) => Object.assign(new Error(message), { path })
const plain = (value) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)

/** Return a checked length or a reference to a declared system scale. */
export function lengthValue(value, path, kind, system = {}) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return `${value}px`
  if (typeof value === 'string' && /^(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|%)$/.test(value))
    return value
  const builtins =
    kind === 'radius'
      ? ['control', 'surface', 'mark', 'round', 'card', 'pill']
      : ['hair', 'tight', 'related', 'group', 'section', 'page']
  if (
    typeof value === 'string' &&
    (builtins.includes(value) || Object.hasOwn(system[kind] ?? {}, value))
  ) {
    const ref = kind === 'radius' ? ({ card: 'surface', pill: 'round' }[value] ?? value) : value
    return `var(--warp-config-system-${kind}-${ref},var(--warp-${kind}-${ref}))`
  }
  throw bad(path, 'must be a nonnegative length or known scale reference')
}

function textInputs(input) {
  if (!plain(input)) throw bad('system.text', 'must be a plain object')
  const out = []
  for (const [role, values] of Object.entries(input)) {
    if (!Object.hasOwn(roles, role)) throw bad(`system.text.${role}`, 'unsupported text role')
    if (!plain(values)) throw bad(`system.text.${role}`, 'must be a plain object')
    for (const [field, value] of Object.entries(values)) {
      const path = `system.text.${role}.${field}`
      if (!roles[role].includes(field)) throw bad(path, 'unsupported text property')
      let css
      if (field === 'size' || field === 'letterSpacing') css = lengthValue(value, path, 'space')
      else if (field === 'weight' || field === 'lineHeight') {
        if (
          typeof value !== 'number' ||
          !Number.isFinite(value) ||
          value < 0 ||
          (field === 'weight' && (value < 1 || value > 1000))
        )
          throw bad(path, 'invalid numeric text value')
        css = String(value)
      } else {
        if (typeof value !== 'string' || !value.trim() || /[;{}<>]/.test(value))
          throw bad(path, 'must be a safe CSS value')
        if (
          field === 'transform' &&
          !['none', 'uppercase', 'lowercase', 'capitalize'].includes(value)
        )
          throw bad(path, 'invalid text transform')
        css = value
      }
      out.push(`--warp-config-system-text-${role}-${names[field] ?? field}:${css}`)
    }
  }
  return out
}

/** Return a checked shadow or a reference to a configured elevation. */
export function shadowValue(value, path) {
  if (value === 'none') return value
  if (typeof value === 'string' && Object.hasOwn(elevation, value)) {
    const index = elevation[value]
    return `var(--warp-config-system-elevation-${index},var(--warp-elevation-${index}))`
  }
  if (
    typeof value !== 'string' ||
    !/^(?:none|(?:inset\s+)?(?:0|-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em))\s+(?:0|-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em))(?:\s+(?:0|(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em)))?(?:\s+#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8}))?)$/i.test(
      value,
    )
  )
    throw bad(path, 'must be none or a supported shadow')
  return value
}

function shadowInputs(input) {
  if (!plain(input)) throw bad('system.shadow', 'must be a plain object')
  return Object.entries(input).map(([name, value]) => {
    const path = `system.shadow.${name}`
    if (!Object.hasOwn(elevation, name)) throw bad(path, 'unsupported elevation')
    // System values must be literal; self-references would create a CSS cycle.
    const css = value === 'none' ? value : shadowValue(value, path)
    if (css.startsWith('var(')) throw bad(path, 'shadow scale references are not supported here')
    return `--warp-config-system-elevation-${elevation[name]}:${css}`
  })
}

function motionInputs(input) {
  if (!plain(input)) throw bad('system.motion', 'must be a plain object')
  const out = []
  for (const [key, values] of Object.entries(input)) {
    if (key !== 'duration' || !plain(values))
      throw bad(`system.motion.${key}`, 'unsupported motion property')
    for (const [name, value] of Object.entries(values)) {
      const path = `system.motion.duration.${name}`
      if (!['spring', 'sweep', 'frame'].includes(name)) throw bad(path, 'unsupported duration')
      const css =
        typeof value === 'number' && Number.isFinite(value) && value >= 0 ? `${value}ms` : value
      if (typeof css !== 'string' || !/^(?:\d+(?:\.\d+)?|\.\d+)(?:ms|s)$/.test(css))
        throw bad(path, 'must be a nonnegative duration')
      out.push(`--warp-config-system-${name}-duration:${css}`)
    }
  }
  return out
}

/** Validate additional system dictionaries against the currently bound inputs. */
export function extraSystemInputs(kind, input) {
  if (kind === 'text') return textInputs(input)
  if (kind === 'shadow') return shadowInputs(input)
  if (kind === 'motion') return motionInputs(input)
  throw bad(`system.${kind}`, 'unsupported system scale')
}
