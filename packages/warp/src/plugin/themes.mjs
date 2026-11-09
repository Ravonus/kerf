// Resolves configured palettes without changing the legacy warp() output.
const namePattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const reserved = new Set([
  'auto',
  'default',
  'light',
  'dark',
  'white',
  'black',
  'neutral',
  'accent',
  'positive',
  'caution',
  'critical',
  'info',
  'page',
  'surface',
  'surface-raised',
  'surface-sunken',
  'text',
  'text-subtle',
  'text-faint',
  'border',
  'border-strong',
  'focus',
  'accent-soft',
  'accent-text',
  'on-accent',
  'constructor',
  'prototype',
  '__proto__',
])
const themeKeys = new Set(['system', 'seed', 'colors', 'parts', 'tokens'])
const colorParts = new Set([
  'bg',
  'text',
  'label',
  'highlight',
  'stroke',
  'base',
  'shadowColor',
  'borderColor',
])
const bad = (path, message) => Object.assign(new Error(message), { path })
const plain = (value) =>
  value !== null &&
  typeof value === 'object' &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)

function object(value, path) {
  if (!plain(value)) throw bad(path, 'must be a plain object')
  return value
}

function names(dict, path) {
  for (const name of Object.keys(object(dict, path))) {
    if (!namePattern.test(name) || reserved.has(name))
      throw bad(`${path}.${name}`, 'invalid or reserved name')
  }
}

function merge(base, patch, path) {
  const result = { ...object(base, path) }
  for (const [key, value] of Object.entries(object(patch, path))) {
    const at = path ? `${path}.${key}` : key
    if (Array.isArray(value) || value === null) throw bad(at, 'must not be null or an array')
    if (plain(value) && Object.hasOwn(value, 'hue')) result[key] = color(value, at)
    else if (plain(value)) result[key] = merge(plain(result[key]) ? result[key] : {}, value, at)
    else if (typeof value === 'object') throw bad(at, 'must be a plain object')
    else result[key] = value
  }
  return result
}

function color(value, path) {
  if (plain(value)) {
    if (
      Object.keys(value).some((key) => key !== 'hue' && key !== 'chroma') ||
      !Number.isFinite(value.hue) ||
      value.hue < 0 ||
      value.hue >= 360 ||
      !Number.isFinite(value.chroma) ||
      value.chroma < 0 ||
      value.chroma > 0.37
    )
      throw bad(path, 'must be a hue and chroma family')
    return { hue: value.hue, chroma: value.chroma }
  }
  if (typeof value !== 'string' || !value || /[;{}<>]/.test(value))
    throw bad(path, 'must be a colour')
  if (value.startsWith('#') && !/^#[0-9a-f]{6}$/i.test(value)) throw bad(path, 'must be #rrggbb')
  return value
}

function colorsFor(dict, path) {
  const resolved = { white: '#ffffff', black: '#000000' }
  const visiting = []
  function resolve(name) {
    if (Object.hasOwn(resolved, name)) return resolved[name]
    const index = visiting.indexOf(name)
    if (index !== -1)
      throw bad(`${path}.${name}`, `colour cycle ${[...visiting.slice(index), name].join(' -> ')}`)
    if (!Object.hasOwn(dict, name))
      throw bad(`${path}.${visiting.at(-1)}`, `unknown colour \`${name}\``)
    visiting.push(name)
    const value = color(dict[name], `${path}.${name}`)
    const result =
      typeof value === 'string' && /^[a-z][a-z0-9-]*$/.test(value) ? resolve(value) : value
    visiting.pop()
    resolved[name] = result
    return result
  }
  for (const name of Object.keys(dict).sort()) resolve(name)
  return resolved
}

function partColors(parts, colors, path) {
  const result = {}
  for (const [key, value] of Object.entries(object(parts, path))) {
    const at = `${path}.${key}`
    if (colorParts.has(key) && (!plain(value) || Object.hasOwn(value, 'hue'))) {
      const candidate = color(value, at)
      if (typeof candidate === 'string' && /^[a-z][a-z0-9-]*$/.test(candidate)) {
        if (!Object.hasOwn(colors, candidate)) throw bad(at, `unknown colour \`${candidate}\``)
        result[key] = colors[candidate]
      } else result[key] = candidate
    } else if (plain(value)) result[key] = partColors(value, colors, at)
    else result[key] = value
  }
  return result
}

function seed(value, path) {
  if (value === undefined) return {}
  if (typeof value === 'string' || (plain(value) && Object.hasOwn(value, 'hue')))
    return { accent: value }
  const out = object(value, path)
  for (const key of Object.keys(out))
    if (!['accent', 'neutral'].includes(key)) throw bad(`${path}.${key}`, 'unknown seed role')
  return out
}

function validateSystem(system, path) {
  object(system, path)
  for (const kind of ['space', 'radius', 'border', 'padding', 'control', 'field']) {
    if (system[kind] === undefined) continue
    for (const [name, value] of Object.entries(object(system[kind], `${path}.${kind}`))) {
      if (typeof value === 'number') {
        if (!Number.isFinite(value) || value < 0)
          throw bad(`${path}.${kind}.${name}`, 'must be a nonnegative finite length')
        system[kind][name] = `${value}px`
      }
    }
  }
}

/**
 * @template B, P
 * @typedef {B extends object ? P extends object ? {
 *   [K in keyof B | keyof P]: K extends keyof P ? K extends keyof B
 *     ? ThemeMerge<B[K], P[K]> : P[K] : K extends keyof B ? B[K] : never
 * } : P : P} ThemeMerge
 */

/**
 * @template T
 * @typedef {T extends string ? string : T extends number ? number | string :
 *   T extends object ? { [K in keyof T]: ThemeValues<T[K]> } : T} ThemeValues
 */

/**
 * @template T
 * @typedef {ThemeValues<T> & { colors: T extends { colors: infer C } ? ThemeValues<C> : {},
 *   parts: T extends { parts: infer P } ? ThemeValues<P> : {} }} ResolvedPalette
 */

/**
 * Resolve the base palette and named palette overrides after merging their dictionaries.
 * @template {object} T
 * @param {T} [input]
 * @returns {{ default: ResolvedPalette<T> } & (T extends { themes: infer N } ? {
 *   [K in keyof N]: ResolvedPalette<ThemeMerge<T, N[K]>>
 * } : {})}
 */
export function resolveThemes(input = {}) {
  object(input, 'config')
  const base = {}
  for (const key of themeKeys) if (input[key] !== undefined) base[key] = input[key]
  if (base.seed !== undefined) base.seed = seed(base.seed, 'seed')
  const baseColors = object(base.colors ?? {}, 'colors')
  names(baseColors, 'colors')
  const themes = object(input.themes ?? {}, 'themes')
  names(themes, 'themes')
  for (const name of Object.keys(themes))
    if (Object.hasOwn(baseColors, name))
      throw bad(`themes.${name}`, 'theme and colour names collide')
  const result = {}
  const entries = /** @type {[string, Record<string, unknown>][]} */ ([
    ['default', {}],
    ...Object.entries(themes).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  ])
  for (const [name, patch] of entries) {
    const path = name === 'default' ? '' : `themes.${name}`
    object(patch, path || 'config')
    for (const key of Object.keys(patch))
      if (!themeKeys.has(key)) throw bad(`${path}.${key}`, 'unknown theme option')
    for (const key of Object.keys(object(patch.colors ?? {}, `${path}.colors`)))
      if (!Object.hasOwn(baseColors, key))
        throw bad(`${path}.colors.${key}`, 'theme cannot add a colour')
    const normalized = { ...patch }
    if (patch.seed !== undefined) normalized.seed = seed(patch.seed, `${path}.seed`)
    const merged = merge(merge({}, base, ''), normalized, path)
    validateSystem(merged.system ?? {}, path ? `${path}.system` : 'system')
    const colors = colorsFor(merged.colors ?? {}, path ? `${path}.colors` : 'colors')
    if (merged.seed) {
      for (const [role, value] of Object.entries(merged.seed)) {
        const at = path ? `${path}.seed.${role}` : `seed.${role}`
        const resolved =
          typeof value === 'string' && Object.hasOwn(colors, value)
            ? colors[value]
            : color(value, at)
        if (typeof resolved === 'string' && !/^#[0-9a-f]{6}$/i.test(resolved))
          throw bad(at, 'seed must resolve to #rrggbb or a hue and chroma family')
        merged.seed[role] = resolved
      }
    }
    result[name] = {
      ...merged,
      colors,
      parts: partColors(merged.parts ?? {}, colors, path ? `${path}.parts` : 'parts'),
    }
  }
  return result
}
