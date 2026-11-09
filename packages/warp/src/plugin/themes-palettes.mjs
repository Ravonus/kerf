// Resolve the named-colour palette slice; other themed values remain unsupported.
import { resolveThemes } from './themes.mjs'

const bad = (path, message) => Object.assign(new Error(message), { path })
const plain = (value) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)

/** Validate named palettes and retain only configured named colours. */
export function preparePalettes(input) {
  if (input.themes === undefined && input.dials?.palette === undefined) return undefined
  const themes = input.themes === undefined ? {} : input.themes
  if (!plain(themes)) throw bad('themes', 'must be a plain object')
  const entries = Object.entries(themes)
  if (!entries.length && input.dials?.palette === undefined) return undefined
  for (const key of ['seed', 'tokens', 'parts']) {
    const value = input[key]
    if (value !== undefined && (!plain(value) || Object.keys(value).length))
      throw bad(key, 'not supported together with named palettes yet')
  }
  for (const [name, value] of entries) {
    if (!plain(value)) throw bad(`themes.${name}`, 'must be a plain object')
    for (const key of Object.keys(value))
      if (key !== 'colors')
        throw bad(`themes.${name}.${key}`, 'not supported in named palettes yet')
  }
  const all = resolveThemes({ colors: input.colors ?? {}, themes })
  const colorNames = Object.keys(input.colors ?? {}).sort()
  const palettes = Object.fromEntries(
    Object.entries(all).map(([name, theme]) => {
      const colors = Object.fromEntries(
        colorNames.map((key) => {
          const value = theme.colors[key]
          if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value))
            throw bad(
              `${name === 'default' ? 'colors' : `themes.${name}.colors`}.${key}`,
              'only hex colours and aliases to hex are supported yet',
            )
          return [key, value]
        }),
      )
      return [name, colors]
    }),
  )
  const requested = input.dials?.palette === undefined ? 'default' : input.dials.palette
  const selected = requested === 'auto' ? 'default' : requested
  if (typeof selected !== 'string' || !Object.hasOwn(palettes, selected))
    throw bad('dials.palette', `unknown palette; use auto, ${Object.keys(palettes).join(', ')}`)
  return { palettes, selected }
}

/** Emit palette markers and complete named colour resets at every palette boundary. */
export function paletteCss({ palettes, selected }) {
  const declarations = (name) =>
    [
      `--warp-palette-current:${name}`,
      ...Object.entries(palettes[name]).map(([key, value]) => `--warp-named-${key}:${value}`),
    ].join(';')
  const names = Object.keys(palettes)
  const root = `:root{--warp-palette-names:${names.join(' ')};--warp-palette-default:${selected}}`
  const implicit = `:root:not([data-palette]){${declarations(selected)}}`
  const fallback = `[data-palette]{${declarations('default')}}`
  const explicit = names.map((name) => `[data-palette="${name}"]{${declarations(name)}}`).join('')
  return `@layer warp.tokens{${root}${implicit}${fallback}${explicit}}\n`
}
