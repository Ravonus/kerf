// W043 in `weft check`: a React habit that compiles and renders something else. `data-x={true}` is a literal, so it can
// be told from weft's own `data-open={open}`, whose presence form `[data-open]` selectors depend on (docs/react-props.md).

import { diagnostic, positions } from './diag.mjs'
import { scanJsx } from './jsx-scan.mjs'

const NATIVE = /^[a-z][\w-]*$/
const LITERAL = /\bdata-[\w-]+\s*=\s*\{\s*(?:true|false)\s*\}/

/** @param {{ files: { rel: string, text: string }[] }} options the checked .tsx/.jsx files */
export function reactChecks({ files }) {
  const out = []
  for (const { rel, text } of files) {
    if (!LITERAL.test(text)) continue
    const pos = positions(text)
    for (const el of scanJsx(text, rel).elements) {
      if (!NATIVE.test(el.name)) continue
      for (const a of el.attrs) {
        if (!a.name.startsWith('data-') || a.kind !== 'expr' || (a.expr !== 'true' && a.expr !== 'false')) continue
        const on = a.expr === 'true'
        // Removing the attribute takes the space before it too.
        const [from, to] = on ? [a.start, a.end] : [text.slice(0, a.start).trimEnd().length, a.end]
        const why = on
          ? `\`${a.name}={true}\` writes \`${a.name}=""\`, not React's \`"true"\`, so \`[${a.name}="true"]\` won't match. Write \`${a.name}\` for a presence flag, or \`${a.name}="true"\` for the word.`
          : `\`${a.name}={false}\` writes no attribute, not React's \`"false"\`. Drop it, or write \`${a.name}="false"\` for the word.`
        const fix = { description: on ? `Write \`${a.name}\`, which renders the same` : `Remove \`${a.name}\`, which renders the same`, safe: true, edits: [{ file: rel, span: pos.span(from, to), offset: [from, to], text: on ? a.name : '' }] }
        out.push(diagnostic({ code: 'W043', file: rel, span: pos.span(a.start, a.end), offset: [a.start, a.end], why, fix }))
      }
    }
  }
  return out
}
