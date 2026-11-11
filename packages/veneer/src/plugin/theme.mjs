// `veneer({ colors, system, parts, themes })`: names colours once, restyles any part in any state, and ships named
// themes that switch at runtime (`data-palette`, `setDial('palette', name)`). Everything here is emitted only when the
// app configures it, so an app that sets nothing gets exactly veneer's own CSS. No Node here: a browser can run it too
// (`@kerf-js/veneer/theme`), given the stylesheet facts theme-context.mjs reads.
import { contrast, fromHex, toLinear } from '../../tokens/color.mjs'
import { themeCss } from './theme-css.mjs'
import { PARTS, STATES, allParts, propsOf, statesOf } from './theme-parts.mjs'
import { motionNames, motionRef, motionToken, motionValue } from './theme-motion.mjs'
import { textTokens } from './theme-text.mjs'
import { NAME, bad, fontValue, plain, px, safe } from './theme-values.mjs'

const BUILTIN = new Set(['white', 'black', 'transparent', 'currentColor', 'inherit'])
const VENEER_COLORS = [
  'page',
  'surface',
  'surface-raised',
  'surface-sunken',
  'text',
  'text-subtle',
  'text-faint',
  'border',
  'border-strong',
  'accent-solid',
  'accent-soft',
  'accent-text',
  'accent-border',
  'focus',
  'sweep',
]
const SPACE = ['hair', 'tight', 'related', 'group', 'section', 'page']
const RADIUS = {
  control: 'control',
  surface: 'surface',
  mark: 'mark',
  round: 'round',
  pill: null,
  none: null,
}
const SHADOW = { none: 'none', 0: 0, 1: 1, 2: 2, 3: 3, sm: 1, md: 2, lg: 3 }
const SYSTEM = {
  radius: (k) => RADIUS[k] !== undefined && RADIUS[k] !== null && `--veneer-radius-${k}`,
  space: (k) => SPACE.includes(k) && `--veneer-space-${k}`,
  pad: (k) => ['control', 'surface'].includes(k) && `--veneer-pad-${k}`,
  control: (k) => ['sm', 'md', 'lg'].includes(k) && `--veneer-control-${k}`,
  font: (k) => ['sans', 'display', 'mono'].includes(k) && `--veneer-font-${k}`,
  shadow: (k) =>
    SHADOW[k] !== undefined && typeof SHADOW[k] === 'number' && `--veneer-elevation-${SHADOW[k]}`,
  border: (k) => ['hairline', 'emphasis'].includes(k) && `--veneer-border-${k}`,
  icon: (k) => ['sm', 'md', 'stroke'].includes(k) && `--veneer-icon-${k}`,
}
const UNITLESS = new Set(['weight', 'leading', 'stroke'])

export { bad }

// -- reading values ------------------------------------------------------------------------------------------------

/** A colour value as CSS: a configured name reads its variable, so a theme that renames it repaints every use. */
function colorValue(value, colors, path) {
  if (typeof value !== 'string' || !safe(value))
    throw bad(path, 'must be a colour name or a CSS colour')
  if (colors.has(value)) return `var(--veneer-color-${value})`
  if (VENEER_COLORS.includes(value)) return `var(--veneer-color-${value})`
  if (
    BUILTIN.has(value) ||
    /^(#[0-9a-f]{3,8}|(rgb|hsl|oklch|oklab|lab|lch|color|color-mix|light-dark|var)\()/i.test(value)
  )
    return value
  throw bad(path, `unknown colour \`${value}\`; name it in \`colors\`, or use #rrggbb`)
}

const KINDS = {
  color: colorValue,
  length: (v) => px(v),
  space: (v) => (SPACE.includes(v) ? `var(--veneer-space-${v})` : px(v)),
  radius: (v) =>
    v === 'pill'
      ? '9999px'
      : v === 'none'
        ? '0px'
        : RADIUS[v]
          ? `var(--veneer-radius-${v})`
          : px(v),
  shadow: (v) =>
    SHADOW[v] === 'none'
      ? 'none'
      : SHADOW[v] !== undefined
        ? `var(--veneer-elevation-${SHADOW[v]})`
        : v,
  font: fontValue,
  plain: (v) => String(v),
}

/** A part's value as CSS. `names` holds the configured colour and motion names. */
function read(kind, value, names, path) {
  if (kind === 'time' || kind === 'ease') return motionRef(kind, value, { names, at: path })
  if (!safe(value)) throw bad(path, 'must be a CSS value or a number')
  return kind === 'color' ? colorValue(value, names.colors, path) : KINDS[kind](value)
}

// -- options -------------------------------------------------------------------------------------------------------

function checkColors(colors = {}, path) {
  if (!plain(colors)) throw bad(path, 'must be an object of names to colours')
  const out = {}
  for (const [name, value] of Object.entries(colors)) {
    if (!NAME.test(name) || VENEER_COLORS.includes(name) || BUILTIN.has(name))
      throw bad(`${path}.${name}`, 'must be a lowercase name that veneer does not already use')
    if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value))
      throw bad(
        `${path}.${name}`,
        'must be #rrggbb (a tone is solved from it, and contrast is checked)',
      )
    out[name] = value.toLowerCase()
  }
  return out
}

/** `system` as `--veneer-*` declarations, checked against the stylesheet's own token names (`ctx.tokenNames`). */
function systemTokens(system = {}, ctx, path) {
  if (!plain(system)) throw bad(path, 'must be an object')
  const out = {}
  for (const [group, entries] of Object.entries(system)) {
    if (!plain(entries)) throw bad(`${path}.${group}`, 'must be an object')
    for (const [key, value] of Object.entries(entries)) {
      const at = `${path}.${group}.${key}`
      if (group === 'text') {
        textTokens(key, value, { ...ctx, out, at })
        continue
      }
      if (group === 'duration' || group === 'ease') {
        out[motionToken(group, key, { ...ctx, at })] = motionValue(group, value, at)
        continue
      }
      const token = SYSTEM[group]?.(key)
      if (!token)
        throw bad(
          at,
          SYSTEM[group]
            ? 'unknown step'
            : `unknown group; use text, duration, ease, ${Object.keys(SYSTEM).join(', ')}`,
        )
      if (!safe(value)) throw bad(at, 'must be a CSS value or a number')
      out[token] =
        group === 'font' ? KINDS.font(value) : UNITLESS.has(key) ? String(value) : px(value)
    }
  }
  return out
}

/** Flattens a part's config to `{ key, part, prop, state, target, value }` rows, validating each. */
function partRows(parts = {}, names, path) {
  if (!plain(parts)) throw bad(path, 'must be an object of parts')
  const specs = new Map(allParts())
  const rows = []
  const walk = (name, config, at) => {
    const spec = specs.get(name)
    if (!spec) throw bad(at, `unknown part; use ${[...specs.keys()].join(', ')}`)
    if (!plain(config)) throw bad(at, 'must be an object')
    const props = propsOf(spec)
    const add = (state, entries, where) => {
      for (const [prop, value] of Object.entries(entries)) {
        const target = props[prop]
        if (!target)
          throw bad(`${where}.${prop}`, `unknown property; use ${Object.keys(props).join(', ')}`)
        rows.push({
          part: name,
          spec,
          prop,
          state,
          target,
          value: read(target.kind, value, names, `${where}.${prop}`),
        })
      }
    }
    const rest = {}
    for (const [key, value] of Object.entries(config)) {
      if (spec.sub?.[key]) walk(`${name}.${key}`, value, `${at}.${key}`)
      else if (STATES[key]) {
        if (!statesOf(spec).includes(key)) throw bad(`${at}.${key}`, `${name} has no ${key} state`)
        if (!plain(value)) throw bad(`${at}.${key}`, 'must be an object of properties')
        add(key, value, `${at}.${key}`)
      } else rest[key] = value
    }
    add(null, rest, at)
  }
  for (const [name, config] of Object.entries(parts)) walk(name, config, `${path}.${name}`)
  return rows
}

/** Validates `colors`, `system`, `parts` and `themes`. `tokenNames` is every `--veneer-*` the stylesheet declares. */
export function themeOptions(input, tokenNames, checkTheme) {
  const out = {}
  const colors = checkColors(input.colors, 'colors')
  if (Object.keys(colors).length) out.colors = colors
  const names = (c, ...systems) => ({ colors: new Set(Object.keys(c)), ...motionNames(...systems) })
  // the app's own text roles, from the page's system and every theme's: each gets one rule. `media` holds the
  // tokens a breakpoint sets, per scope.
  out.roles = {}
  out.media = {}
  const ctx = { tokenNames, roles: out.roles }
  out.system = systemTokens(input.system, { ...ctx, media: out.media }, 'system')
  out.rows = partRows(input.parts, names(colors, input.system), 'parts')
  out.themes = {}
  if (input.themes !== undefined && !plain(input.themes))
    throw bad('themes', 'must be an object of named themes')
  for (const [name, theme] of Object.entries(input.themes ?? {})) {
    const at = `themes.${name}`
    if (!NAME.test(name) || name === 'auto') throw bad(at, 'must be a lowercase name, not auto')
    if (!plain(theme)) throw bad(at, 'must be an object')
    for (const key of Object.keys(theme))
      if (!['seed', 'colors', 'system', 'parts', 'tokens'].includes(key))
        throw bad(`${at}.${key}`, 'unknown option')
    const own = checkColors(theme.colors, `${at}.colors`)
    const seed =
      theme.seed && checkTheme.seed(theme.seed, `${at}.seed`, { ...input.colors, ...theme.colors })
    const neutral = seed?.neutral
      ? {
          '--veneer-ref-neutral-h': seed.neutral.hue,
          '--veneer-ref-neutral-c': seed.neutral.chroma,
        }
      : {}
    const media = {}
    out.themes[name] = {
      seed,
      colors: own,
      system: {
        ...neutral,
        ...systemTokens(theme.system, { ...ctx, media }, `${at}.system`),
        ...checkTheme.tokens(theme.tokens, `${at}.tokens`),
      },
      media,
      rows: partRows(
        theme.parts,
        names({ ...colors, ...own }, input.system, theme.system),
        `${at}.parts`,
      ),
    }
  }
  if (input.default !== undefined && !out.themes[input.default])
    throw bad('dials.palette', 'must name one of `themes`')
  return out
}

// -- contrast ------------------------------------------------------------------------------------------------------

const linear = (hex) => {
  const { L, C, H } = fromHex(hex)
  return toLinear({ L, C, H })
}

/** D010 for parts: a configured text colour on a configured fill, both known, below 4.5:1 (3:1 for large type). */
export function partContrast(rows, colors, scope) {
  const hexOf = (v) => {
    const name = /^var\(--veneer-color-([a-z0-9-]+)\)$/.exec(v)?.[1]
    if (v === 'white' || v === 'black') return v === 'white' ? '#ffffff' : '#000000'
    return name ? colors[name] : /^#[0-9a-f]{6}$/i.test(v) ? v : undefined
  }
  const failures = []
  const key = (r) => `${r.part}|${r.state ?? ''}`
  const fills = new Map(rows.filter((r) => r.prop === 'bg').map((r) => [key(r), r]))
  for (const text of rows.filter((r) => r.prop === 'text')) {
    const fill = fills.get(key(text)) ?? fills.get(`${text.part}|`)
    const [fg, bg] = [hexOf(text.value), fill && hexOf(fill.value)]
    if (!fg || !bg) continue
    const ratio = contrast(linear(fg), linear(bg))
    if (ratio < 4.5)
      failures.push(
        `${scope}parts.${text.part}${text.state ? `.${text.state}` : ''}: text ${fg} on ${bg} is ${ratio.toFixed(2)}:1, needs 4.5:1`,
      )
  }
  return failures
}

const safeText = (v) => typeof v === 'string' && v !== '' && !/[;{}<]/.test(v)

/** `tokens` (top level or a theme's): `--veneer-*` names with CSS values; colours stay readable by the contrast check. */
export function checkTokens(tokens, path) {
  for (const [token, value] of Object.entries(tokens ?? {})) {
    if (!/^--veneer-[a-z0-9-]+$/.test(token))
      throw bad(`${path}.${token}`, 'must be a veneer token, like --veneer-color-page')
    if (!safeText(value)) throw bad(`${path}.${token}`, 'must be a CSS value')
    if (
      token.startsWith('--veneer-color-') &&
      !/^(#[0-9a-f]{6}|(oklch|color-mix|light-dark)\(.+\))$/i.test(value)
    )
      throw bad(`${path}.${token}`, 'must be #rrggbb or oklch(), so the contrast check can read it')
  }
  return tokens
}

/** The theming CSS, after D010: each named theme's seed and tokens, and every configured text-on-fill pair. */
export function themed(theme, { context, seed, dials, checkSeed, declare: declareOf }) {
  const failures = partContrast(theme.rows, theme.colors ?? {}, '')
  for (const [name, t] of Object.entries(theme.themes)) {
    failures.push(...partContrast(t.rows, { ...theme.colors, ...t.colors }, `themes.${name}.`))
    if (t.seed || Object.keys(t.system).length) {
      // the same fit a custom page seed gets: the two tightest tokens relit to the default's contrast
      const fit = checkSeed(t.seed ?? seed, declareOf({ seed: t.seed, tokens: t.system }), dials)
      for (const d of fit ? fit.split(';') : []) {
        const at = d.indexOf(':')
        t.system[d.slice(0, at)] = d.slice(at + 1)
      }
    }
  }
  if (failures.length)
    throw Object.assign(new Error(`veneer part colours fail contrast: ${failures.join('; ')}`), {
      code: 'D010',
      failures,
      help: 'Pick a text colour with more contrast against the fill, or set only one of them.',
    })
  return themeCss(theme, context)
}

export { PARTS }
export { tailwindTheme, themeCss, toneChannels } from './theme-css.mjs'
export { normalizeSeed, seedByName } from './seed.mjs'
