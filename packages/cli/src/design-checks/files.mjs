import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { discover } from '../files.mjs'
import { declaration } from './values.mjs'

export function checkFiles(root, exclude, tokens, reporter) {
  // -- CSS files --
  for (const rel of discover(root, { include: ['**/*.css'], exclude })) {
    const text = readFileSync(join(root, rel), 'utf8')
    const css = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    const file = { rel, text }
    const report = reporter(file)
    for (const m of css.matchAll(/(?<=[{;\s])(-?-?[\w-]+)\s*:\s*([^;{}]+)/g)) {
      const prop = m[1].toLowerCase()
      if (prop.startsWith('--')) continue
      const start = m.index + m[0].indexOf(m[2], m[1].length + 1)
      // Restyling warp's parts and the app's theme file are the supported ways past tokens: worth a look, not a stop.
      const opening = css.lastIndexOf('{', m.index)
      const selector = css.slice(
        Math.max(css.lastIndexOf('}', opening), css.lastIndexOf(';', opening)) + 1,
        opening,
      )
      const theming = rel === 'src/theme.css' || /\[data-(?:scope|part)\b/.test(selector)
      if (tokens)
        declaration(
          { prop, value: m[2].trim(), start, end: start + m[2].trimEnd().length },
          theming ? report.warning : report,
        )
      if ((prop === 'outline' || prop === 'outline-width') && /^(none|0(px)?)\s*$/.test(m[2])) {
        const rule = css.lastIndexOf('}', m.index)
        const focused = css.slice(rule + 1, css.indexOf('{', rule + 1))
        if (
          /:focus(?!-within)/.test(focused) &&
          !/box-shadow|border/.test(css.slice(m.index, css.indexOf('}', m.index)))
        )
          report(
            'D036',
            start,
            start + m[2].trimEnd().length,
            `\`${focused.trim()}\` removes the focus ring with nothing in its place: keyboard users lose their place (WCAG 2.4.7).`,
          )
      }
    }
  }

  // -- the page --
  for (const rel of discover(root, { include: ['**/*.html'], exclude })) {
    const text = readFileSync(join(root, rel), 'utf8')
    const m = /<html\b[^>]*>/i.exec(text)
    if (m && !/\blang\s*=/.test(m[0]))
      reporter({ rel, text })(
        'D039',
        m.index,
        m.index + m[0].length,
        '<html> has no `lang`: a screen reader guesses the language to speak (WCAG 3.1.1).',
        { description: 'Set lang="en"', safe: false, text: `${m[0].slice(0, -1)} lang="en">` },
      )
  }
}
