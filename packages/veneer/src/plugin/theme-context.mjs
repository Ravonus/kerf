// The stylesheet facts the theming CSS needs, read from veneer-core's veneer.css. Node only; theme.mjs takes the result.
import { readFileSync } from 'node:fs'

let context
/** Facts read once from veneer-core's stylesheet: sub-layer order, scope roots, token names and the accent formulas. */
export function themeContext(core) {
  if (context) return context
  const css = readFileSync(new URL('styles/veneer.css', core), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  )
  const layers = /@layer (veneer\.tokens[^;]*);/
    .exec(css)[1]
    .split(',')
    .map((l) => l.trim().slice('veneer.'.length))
  const scopes = /\n(:root, \[data-expression\][^{]*)\{/.exec(css)[1].replace(/\s+/g, ' ').trim()
  const tokenNames = new Set(css.match(/--veneer-[a-z0-9-]+(?=\s*:)/g))
  const formula = (name) =>
    new RegExp(`--veneer-color-accent-${name}:\\s*([^;]+);`).exec(css)[1].replace(/\s+/g, ' ')
  const formulas = {
    '--_solid': formula('solid'),
    '--_solid-hover': formula('solid-hover'),
    '--_ink-on': formula('on-solid'),
    '--_soft': formula('soft'),
    '--_text': formula('text'),
    '--_border': formula('border'),
  }
  // An expression stop picks some refs by colour token (the primary is the accent, or ink at quiet). Those resolve where
  // the stop is declared, so a palette set below it needs them declared again, per stop (themeCss).
  const stopRefs = (sel) => {
    const at = css.indexOf(`\n${sel} {`)
    const body = css.slice(css.indexOf('{', at) + 1, css.indexOf('\n}', at))
    return (body.match(/--veneer-ref-[a-z0-9-]+:\s*[^;]*var\(--veneer-color-[^;]+;/g) ?? [])
      .map((d) => d.replace(/\s+/g, ' '))
      .join('')
  }
  const stops = {
    balanced: stopRefs(':root, [data-expression="balanced"]'),
    quiet: stopRefs('[data-expression="quiet"]'),
    vivid: stopRefs('[data-expression="vivid"]'),
  }
  context = { layers, scopes, tokenNames, formulas, stops }
  return context
}

// A fluid role is written in the user's rem, --veneer-rem. veneer.css sets it beside its root font-size; a page that loads
// the tokens alone keeps the browser's root size, where it is 1rem. `:where` lets veneer.css's own value win.
const REM = '@layer veneer.tokens{:where(:root){--veneer-rem:1rem}}\n'

/** The tokens CSS, led by the user's rem when anything in it is fluid. */
export const withRem = (css) => (css.includes('var(--veneer-rem)') ? REM : '') + css
