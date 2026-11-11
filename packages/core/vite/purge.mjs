import { createHash } from 'node:crypto'
import { basename } from 'node:path'
import { purge, words } from '../node/purge.mjs'

/**
 * Removes CSS no built file can reach (node/purge.mjs). Runs last on the client build, and renames each stylesheet it
 * changes: a name hashed before purging would stay the same when the app starts using a new component, and browsers
 * would keep the old, smaller file. `kerf({ purge: false })` turns it off; `purge: { keep: ['knob'] }` keeps names the
 * app builds at run time.
 */
export function purgeCss(keep = []) {
  const sources = []
  return {
    name: 'kerf:purge',
    /** `add(text)`: source that renders on the server only, whose class names the client's files don't hold. */
    api: { add: (text) => sources.push(text) },
    apply: 'build',
    enforce: 'post',
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        if (this.environment && this.environment.name !== 'client') return
        const files = Object.values(bundle)
        const text = (f) =>
          f.type === 'chunk'
            ? f.code
            : typeof f.source === 'string'
              ? f.source
              : Buffer.from(f.source).toString()
        const sheets = files.filter((f) => f.type === 'asset' && f.fileName.endsWith('.css'))
        if (!sheets.length) return
        const found = words(
          [...files.filter((f) => /\.(js|mjs|html)$/.test(f.fileName)).map(text), ...sources],
          keep,
        )
        const moved = []
        const purged = purge(sheets.map(text), found)
        for (const [i, sheet] of sheets.entries()) {
          const css = purged[i]
          const hash = createHash('sha256').update(css).digest('base64url').slice(0, 8)
          const name = sheet.fileName.replace(/(-[\w-]{8})?\.css$/, `-${hash}.css`)
          moved.push([sheet.fileName, name])
          delete bundle[sheet.fileName]
          this.emitFile({ type: 'asset', fileName: name, source: css })
        }
        for (const f of Object.values(bundle)) {
          for (const [from, to] of moved) {
            if (f.type === 'chunk') {
              f.code = f.code.replaceAll(basename(from), basename(to)) // by file name: with `base: './'` a chunk's preload list says ./index-….css
              if (f.viteMetadata?.importedCss.delete(from)) f.viteMetadata.importedCss.add(to)
            } else if (/\.(html|json)$/.test(f.fileName)) f.source = text(f).replaceAll(from, to)
          }
        }
      },
    },
  }
}
