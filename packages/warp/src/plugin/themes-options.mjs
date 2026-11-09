// Validate warp configuration before producing any contribution.
import { themeSchema } from '@weft-js/warp-core/theme-schema'
import { fromHex } from '../../tokens/color.mjs'
import { resolveThemes } from './themes.mjs'

const DEFAULT = { hue: 152, chroma: 0.115 }
const DIALS = {
  expression: ['quiet', 'balanced', 'vivid'],
  density: ['compact', 'cozy', 'comfortable'],
  flair: ['sweep', 'none'],
  theme: ['light', 'dark'],
}
const RADII = { sharp: [2, 2, 2], soft: [8, 12, 4], round: [14, 20, 6] }
const FONTS = {
  body: ['sans', 'ui-sans-serif, system-ui, sans-serif'],
  display: ['display', 'ui-sans-serif, system-ui, sans-serif'],
  mono: ['mono', 'ui-monospace, monospace'],
}
const safe = (value) => typeof value === 'string' && value !== '' && !/[;{}<]/.test(value)
const bad = (path, message) => Object.assign(new Error(message), { path })

function hueOf(value, name) {
  if (typeof value === 'string') {
    if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${name} must be #rrggbb`)
    const { C, H } = fromHex(value)
    return { hue: Math.round(H * 10) / 10, chroma: Math.round(C * 1000) / 1000 }
  }
  const { hue, chroma } = value ?? {}
  if (!(hue >= 0 && hue < 360) || !(chroma >= 0 && chroma <= 0.37))
    throw new Error(
      `${name === 'accent' ? 'seed' : name} is { hue: 0–360, chroma: 0–0.37 } or ${name === 'accent' ? '{ accent: "#rrggbb" }' : '"#rrggbb"'}`,
    ) // weft reports it as P115
  return { hue, chroma }
}

function normalizeSeed(seed) {
  const { accent, neutral, ...rest } = seed ?? {}
  const out = hueOf(
    accent ?? (Object.keys(rest).length || neutral === undefined ? rest : DEFAULT),
    'accent',
  )
  return neutral === undefined ? out : { ...out, neutral: hueOf(neutral, 'neutral') }
}

function namedColors(input) {
  for (const key of ['system', 'themes']) {
    if (input[key] === undefined) continue
    const value = input[key]
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    )
      throw bad(key, 'must be a plain object')
    const first = Object.keys(value)[0]
    if (first)
      throw bad(`${key}.${first}`, 'not supported until theme contrast validation is available')
  }
  if (input.colors === undefined) return undefined
  if (
    !input.colors ||
    typeof input.colors !== 'object' ||
    Array.isArray(input.colors) ||
    (Object.getPrototypeOf(input.colors) !== Object.prototype &&
      Object.getPrototypeOf(input.colors) !== null)
  )
    throw bad('colors', 'must be a plain object')
  const resolved = resolveThemes({ colors: input.colors }).default.colors
  const entries = Object.keys(input.colors)
    .sort()
    .map((name) => {
      const value = resolved[name]
      if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value))
        throw bad(`colors.${name}`, 'only hex colours and aliases to hex are supported yet')
      return [name, value]
    })
  return entries.length ? Object.fromEntries(entries) : undefined
}

function buttonCandidate(input) {
  if (input.parts === undefined) return undefined
  const parts = input.parts
  if (
    !parts ||
    typeof parts !== 'object' ||
    Array.isArray(parts) ||
    Object.getPrototypeOf(parts) !== Object.prototype
  )
    throw bad('parts', 'must be a plain object')
  for (const part of Object.keys(parts))
    if (part !== 'button') throw bad(`parts.${part}`, 'unsupported part')
  if (!Object.hasOwn(parts, 'button')) return undefined
  const button = parts.button
  if (
    !button ||
    typeof button !== 'object' ||
    Array.isArray(button) ||
    Object.getPrototypeOf(button) !== Object.prototype
  )
    throw bad('parts.button', 'must be a plain object')
  for (const key of Object.keys(button)) {
    const group = themeSchema.groups.find((row) => row.id === `button.rest.${key}`)
    if (!group) throw bad(`parts.button.${key}`, 'unknown property or unsupported state')
    if (!['bg', 'text'].includes(key) || group.domain !== 'color')
      throw bad(`parts.button.${key}`, 'unsupported Button property')
  }
  if (!Object.keys(button).length) return undefined
  for (const key of ['bg', 'text'])
    if (!Object.hasOwn(button, key))
      throw bad(`parts.button.${key}`, 'both bg and text are required')
  const resolved = resolveThemes({ colors: input.colors ?? {}, parts }).default.parts.button
  for (const key of ['bg', 'text'])
    if (typeof resolved[key] !== 'string' || !/^#[0-9a-f]{6}$/i.test(resolved[key]))
      throw bad(`parts.button.${key}`, 'only hex colours or aliases to hex are supported yet')
  return resolved
}

function options(input) {
  const out = {}
  for (const key of Object.keys(input))
    if (
      ![
        'seed',
        'fields',
        'dials',
        'radius',
        'fonts',
        'tokens',
        'system',
        'colors',
        'parts',
        'themes',
      ].includes(key)
    )
      throw Object.assign(new Error(`unknown option \`${key}\``), { path: key })
  const colors = namedColors(input)
  if (colors) out.namedColors = colors
  const button = buttonCandidate(input)
  if (button) {
    for (const token of Object.keys(input.tokens ?? {})) {
      if (
        /^--warp-(?:button-|config-part-button-|btn-|sweep-|config-part-sweep-)/.test(token) &&
        !/^--warp-(?:sweep|config-part-sweep)-(?:base|stroke|label|text)$/.test(token)
      )
        throw bad(`tokens.${token}`, 'unsupported with Button colours')
    }
    out.buttonCandidate = button
  }
  if (input.fields !== undefined && input.fields !== 'floating' && input.fields !== 'classic')
    throw Object.assign(new Error(`must be 'floating' or 'classic'`), { path: 'fields' })
  if (input.seed !== undefined) {
    try {
      out.seed = normalizeSeed(input.seed)
      if (input.seed?.accent) out.asked = input.seed.accent.toLowerCase()
    } catch (error) {
      throw Object.assign(/** @type {Error} */ (error), { path: 'seed' })
    }
  }
  if (input.fields) out.fields = input.fields
  for (const [dial, value] of Object.entries(input.dials ?? {})) {
    if (!DIALS[dial])
      throw bad(`dials.${dial}`, `unknown dial; use ${Object.keys(DIALS).join(', ')}`)
    if (!DIALS[dial].includes(value))
      throw bad(`dials.${dial}`, `must be one of ${DIALS[dial].join(', ')}`)
  }
  if (input.dials) out.dials = input.dials
  if (input.radius !== undefined) {
    if (!RADII[input.radius]) throw bad('radius', `must be one of ${Object.keys(RADII).join(', ')}`)
    out.radius = input.radius
  }
  for (const [font, value] of Object.entries(input.fonts ?? {})) {
    if (!FONTS[font])
      throw bad(`fonts.${font}`, `unknown font; use ${Object.keys(FONTS).join(', ')}`)
    if (!safe(value)) throw bad(`fonts.${font}`, 'must be a font family or a CSS font stack')
  }
  if (input.fonts) out.fonts = input.fonts
  for (const [token, value] of Object.entries(input.tokens ?? {})) {
    if (!/^--warp-[a-z0-9-]+$/.test(token))
      throw bad(`tokens.${token}`, 'must be a warp token, like --warp-color-page')
    if (!safe(value)) throw bad(`tokens.${token}`, 'must be a CSS value')
    if (
      token.startsWith('--warp-color-') &&
      !/^(#[0-9a-f]{6}|(oklch|color-mix|light-dark)\(.+\))$/i.test(value)
    )
      throw bad(`tokens.${token}`, 'must be #rrggbb or oklch(), so the contrast check can read it')
  }
  if (input.tokens) out.tokens = input.tokens
  return out
}

/** Shared options and validation data used by the warp plugin. */
export { DEFAULT, RADII, FONTS, bad, options }
