// `system.text.<role>`: a role's type tokens. One of veneer's roles takes the tokens veneer has for it; a role the app
// names takes all six, and a rule that applies them to `data-role="<role>"`, as veneer's type.css does for its own.
// A value can change with the viewport: a base, then a value or a fluid line from each min-width. Breakpoints are
// media queries, so a fluid line runs on vw and meets them exactly.
import { NAME, bad, fontValue, plain, px, safe } from './theme-values.mjs'

const PROPS = {
  size: 'font-size',
  weight: 'font-weight',
  leading: 'line-height',
  tracking: 'letter-spacing',
  case: 'text-transform',
  font: 'font-family',
}
const UNITLESS = new Set(['weight', 'leading'])
const format = (prop, v) =>
  prop === 'font' ? fontValue(v) : UNITLESS.has(prop) ? String(v) : px(v)

const round = (n) => Math.round(n * 1e4) / 1e4
// veneer's root font-size is the body size, so the user's rem is --veneer-rem, as in veneer's own fluid roles
const rem = (n) => `${round(n / 16)} * var(--veneer-rem)`
const isFluid = (v) => plain(v) && 'min' in v

/** `{ min, max, from, to }` in px: min at the `from` width, max at `to`, held outside them. */
function fluidCss(v, from, at) {
  const { min, max, to } = v
  if (![min, max, from, to].every(Number.isFinite) || !(to > from))
    throw bad(at, 'must be { min, max, from, to } in px, with to wider than from')
  const slope = (max - min) / (to - from)
  const line = `calc(${rem(min - slope * from)} + ${round(slope * 100)}vw)`
  return `clamp(calc(${rem(Math.min(min, max))}), ${line}, calc(${rem(Math.max(min, max))}))`
}

/** One value as CSS: plain, or a fluid line for a length. */
function valueCss(prop, v, { from, at }) {
  if (isFluid(v)) {
    if (prop !== 'size' && prop !== 'tracking') throw bad(at, 'only size and tracking can be fluid')
    return fluidCss(v, v.from ?? from, at)
  }
  if (!safe(v)) throw bad(at, 'must be a CSS value, a number, or { base, <min-width>: value }')
  return format(prop, v)
}

/** A property's value into `out`, or its base into `out` and each breakpoint's value into `media`. */
function place(token, prop, v, { out, media, at }) {
  if (!plain(v) || isFluid(v)) {
    out[token] = valueCss(prop, v, { at })
    return
  }
  for (const [key, step] of Object.entries(v)) {
    if (key === 'base') out[token] = valueCss(prop, step, { at: `${at}.base` })
    else if (/^[1-9]\d*$/.test(key))
      (media[key] ??= {})[token] = valueCss(prop, step, { from: Number(key), at: `${at}.${key}` })
    else throw bad(`${at}.${key}`, 'must be base or a min-width in px, like 768')
  }
}

/** Writes one role's tokens into `out` and `media`; an app's role also records its properties in `roles`. */
export function textTokens(role, value, { tokenNames, out, media, roles, at }) {
  if (!plain(value)) throw bad(at, 'must be { size, weight, leading, tracking, case, font }')
  const own = [...tokenNames].some((t) => t.startsWith(`--veneer-text-${role}-`))
  if (!own && !NAME.test(role)) throw bad(at, 'must be a lowercase name, like narrative')
  for (const [prop, v] of Object.entries(value)) {
    const token = `--veneer-text-${role}-${prop}`
    if (!PROPS[prop])
      throw bad(`${at}.${prop}`, `unknown property; use ${Object.keys(PROPS).join(', ')}`)
    if (own && !tokenNames.has(token)) throw bad(`${at}.${prop}`, `veneer has no ${token}`)
    place(token, prop, v, { out, media, at: `${at}.${prop}` })
    if (!own) (roles[role] ??= new Set()).add(prop)
  }
}

/** Each breakpoint's tokens on `selector` in `layer`, narrowest first (integer keys iterate in order). */
export const mediaCss = (media = {}, layer, selector) =>
  Object.entries(media)
    .map(
      ([width, tokens]) =>
        `@media (min-width:${width}px){@layer ${layer}{${selector}{${Object.entries(tokens)
          .map(([k, v]) => `${k}:${v}`)
          .join(';')}}}}\n`,
    )
    .join('')

/** The rules for the app's roles, in veneer.layout beside veneer's own, so the app's CSS still wins. */
export function roleCss(roles = {}) {
  const rules = Object.entries(roles).map(
    ([role, props]) =>
      `:where([data-scope="text"][data-role="${role}"]){${[...props]
        .map((p) => `${PROPS[p]}:var(--veneer-text-${role}-${p})`)
        .join(';')}}`,
  )
  return rules.length ? `@layer veneer.layout{${rules.join('')}}\n` : ''
}
