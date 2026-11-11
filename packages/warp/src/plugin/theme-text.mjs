// `system.text.<role>`: a role's type tokens. One of warp's roles takes the tokens warp has for it; a role the app
// names takes all six, and a rule that applies them to `data-role="<role>"`, as warp's type.css does for its own.
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

/** Writes one role's tokens into `out`; an app's role also records its properties in `roles`. */
export function textTokens(role, value, { tokenNames, out, roles, at }) {
  if (!plain(value)) throw bad(at, 'must be { size, weight, leading, tracking, case, font }')
  const own = [...tokenNames].some((t) => t.startsWith(`--warp-text-${role}-`))
  if (!own && !NAME.test(role)) throw bad(at, 'must be a lowercase name, like narrative')
  for (const [prop, v] of Object.entries(value)) {
    const token = `--warp-text-${role}-${prop}`
    if (!PROPS[prop])
      throw bad(`${at}.${prop}`, `unknown property; use ${Object.keys(PROPS).join(', ')}`)
    if (own && !tokenNames.has(token)) throw bad(`${at}.${prop}`, `warp has no ${token}`)
    if (!safe(v)) throw bad(`${at}.${prop}`, 'must be a CSS value or a number')
    out[token] = format(prop, v)
    if (!own) (roles[role] ??= new Set()).add(prop)
  }
}

/** The rules for the app's roles, in warp.layout beside warp's own, so the app's CSS still wins. */
export function roleCss(roles = {}) {
  const rules = Object.entries(roles).map(
    ([role, props]) =>
      `:where([data-scope="text"][data-role="${role}"]){${[...props]
        .map((p) => `${PROPS[p]}:var(--warp-text-${role}-${p})`)
        .join(';')}}`,
  )
  return rules.length ? `@layer warp.layout{${rules.join('')}}\n` : ''
}
