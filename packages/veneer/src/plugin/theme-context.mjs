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
    .map((l) => l.trim().slice(5))
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
