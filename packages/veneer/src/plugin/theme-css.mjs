// The CSS veneer({ colors, parts, themes }) writes: colours as tokens and tones, parts as rules in the veneer.theme layer,
// each named theme under [data-palette]. Read and checked options come from theme.mjs.
import { fromHex } from '../../tokens/color.mjs'
import { STATES } from './theme-parts.mjs'

// -- CSS -----------------------------------------------------------------------------------------------------------

/** The selector a row lands on, with its state put where the part's `&` is. */
function selectorOf(row) {
  const { spec, target, state } = row
  // a target can name its own place for a state: a channel the component animates to, rather than a :hover rule
  const channel = state && target[state]
  const base = target.on ?? spec.sel
  return base.replaceAll('&', channel || !state ? '' : STATES[state])
}

/** Declarations for one row. */
function declarations(row) {
  const t =
    row.state && row.target[row.state] ? { ...row.target, ...row.target[row.state] } : row.target
  if (t.vars) return t.vars.map((v) => `${v}:${row.value}`)
  return [t.css].flat().map((p) => `${p}:${row.value}`)
}

const where = (prefixes, sel) =>
  prefixes
    ? prefixes
        .flatMap((p) => [`:where(${p}) :where(${sel})`, `:where(${p}):where(${sel})`])
        .join(',')
    : `:where(${sel})`

/** One scope's part rules: the page's (`prefixes` null) or a named theme's. Scope tokens land on every scope root. */
const ORDER = [null, ...Object.keys(STATES)]
function partCss(rows, prefixes, scopes) {
  const bySel = new Map()
  // rest first, then the states in a fixed order: every rule has :where() weight, so the later one wins
  const sorted = [...rows].sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state))
  for (const row of sorted) {
    const sel = row.target.scope ? null : selectorOf(row)
    const key = sel ?? '@scopes'
    if (!bySel.has(key)) bySel.set(key, [])
    bySel.get(key).push(...declarations(row))
  }
  let css = ''
  for (const [sel, decls] of bySel) {
    const selector =
      sel === '@scopes'
        ? prefixes
          ? prefixes.flatMap((p) => [p, `${p} :is(${scopes})`]).join(',')
          : scopes
        : where(prefixes, sel)
    css += `${selector}{${decls.join(';')}}`
  }
  return css
}

/** A named colour's six tone channels, solved the way veneer solves its accent: the hue family, lit per theme. */
export function toneChannels(hex, formulas) {
  const { C, H } = fromHex(hex)
  // the accent's chroma still follows the expression dial (--veneer-ref-accent-k), as veneer's own accent does
  const sub = (f) =>
    f
      .replaceAll('var(--_ac)', `calc(${C.toFixed(3)} * var(--veneer-ref-accent-k))`)
      .replaceAll('var(--_ah)', H.toFixed(1))
  return Object.entries(formulas)
    .map(([channel, f]) => `${channel}:${sub(f)}`)
    .join(';')
}

function colorsCss(colors, prefixes, formulas) {
  if (!Object.keys(colors).length) return ''
  const vars = Object.entries(colors)
    .map(([n, v]) => `--veneer-color-${n}:${v}`)
    .join(';')
  const root = prefixes ? prefixes.join(',') : ':root'
  let css = `${root}{${vars}}`
  for (const [name, hex] of Object.entries(colors))
    css += `${where(prefixes, `[data-tone="${name}"]`)}{${toneChannels(hex, formulas)}}`
  return css
}

const declare = (tokens) =>
  Object.entries(tokens)
    .map(([k, v]) => `${k}:${v}`)
    .join(';')

/**
 * The CSS for `colors`, `parts` and each named theme. `ctx` carries the stylesheet facts: `layers` (veneer's sub-layer
 * order), `scopes` (its scope roots) and `formulas` (the accent channel formulas).
 */
export function themeCss(o, ctx) {
  const { layers, scopes, formulas, stops } = ctx
  let parts = colorsCss(o.colors ?? {}, null, formulas) + partCss(o.rows, null, scopes)
  let tokens = ''
  for (const [name, theme] of Object.entries(o.themes)) {
    const prefixes = [
      `[data-palette="${name}"]`,
      ...(o.default === name ? [':root:not([data-palette])'] : []),
    ]
    if (theme.seed) {
      tokens += `${prefixes.join(',')}{--veneer-seed-accent-h:${theme.seed.hue};--veneer-seed-accent-c:${theme.seed.chroma}}`
    }
    // a seed or a fitted token moves colour tokens the stop's refs point at
    if (theme.seed || Object.keys(theme.system).length)
      tokens += stopRefsCss(`[data-palette="${name}"]`, stops)
    if (Object.keys(theme.system).length)
      parts += `${prefixes.flatMap((p) => [p, `${p} :is(${scopes})`]).join(',')}{${declare(theme.system)}}`
    parts += colorsCss(theme.colors, prefixes, formulas) + partCss(theme.rows, prefixes, scopes)
  }
  if (!parts && !tokens) return ''
  return (
    `@layer veneer.${layers.join(',veneer.')},veneer.theme;\n` +
    (tokens && `@layer veneer.tokens{${tokens}}\n`) +
    (parts && `@layer veneer.theme{${parts}}\n`)
  )
}
// A palette below the page's root: the stop's colour refs again, at no specificity so the element's own stop wins.
// The stop is the nearest data-expression above it, or balanced with none; quiet and vivid come later so they win.
function stopRefsCss(at, stops) {
  if (!stops) return ''
  const own = `${at}:not(:root)`
  return (
    (stops.balanced && `:where(${own}){${stops.balanced}}`) +
    (stops.quiet && `:where([data-expression="quiet"] ${own}){${stops.quiet}}`) +
    (stops.vivid && `:where([data-expression="vivid"] ${own}){${stops.vivid}}`)
  )
}

/** Tailwind v4 names for the app's colours (`bg-brand`, `text-ink`), or '' with none: on the var, so themes follow. */
export function tailwindTheme(o) {
  const names = new Set([
    ...Object.keys(o.colors ?? {}),
    ...Object.values(o.themes ?? {}).flatMap((t) => Object.keys(t.colors ?? {})),
  ])
  if (!names.size) return ''
  return `@theme inline {\n${[...names].map((n) => `  --color-${n}: var(--veneer-color-${n});`).join('\n')}\n}\n`
}
