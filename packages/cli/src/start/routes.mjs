import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { diagnostic, locate, positions } from '../diag.mjs'

/**
 * Route findings as diagnostics, pointing at the `meta` export, or at where one goes. H011's fix is that export, as an
 * edit an agent can apply: not safe, since the words are a start and not the page's best.
 */
export function routeDiagnostics(root, found) {
  const text = (f) => {
    try {
      return readFileSync(join(root, f), 'utf8')
    } catch {
      return ''
    }
  }
  return found.map(({ code, severity, file, route, why, help }) => {
    const source = text(file)
    const at =
      code === 'H011' &&
      help?.startsWith('export const') &&
      !/\bexport\s+(?:const|function|async function)\s+meta\b/.test(source)
        ? source.indexOf('export default')
        : -1
    const place = positions(source)
    const fix = at >= 0 && {
      fix: {
        safe: false,
        description: 'Add `meta`',
        edits: [{ file, span: place.span(at, at), offset: [at, at], text: `${help}\n\n` }],
      },
    }
    return {
      ...diagnostic({ code, severity, file, why, help, ...locate(source, 'meta'), ...fix }),
      route,
    }
  })
}
