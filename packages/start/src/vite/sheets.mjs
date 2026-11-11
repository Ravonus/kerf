import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { pieces } from '@kerf/core/node-purge'
import { planSheets, reach } from '../sheets.mjs'
import { INLINE_CSS_MAX } from '../inline.mjs'

/**
 * The client build's stylesheets a page can carry, `{ href: css }`, read by the server build so every preset has them
 * with no file system. Left out: one a relative `url()` would break, and one that could close its `<style>`.
 */
export function inlineSheets(outDir, base, limit = INLINE_CSS_MAX) {
  const dir = join(outDir, 'assets')
  if (!existsSync(dir)) return {}
  const sheets = {}
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.css'))) {
    const css = readFileSync(join(dir, name), 'utf8')
    if (
      css.length <= limit &&
      !/<\/style|<!--/i.test(css) &&
      !/url\(\s*(?!["']?(?:\/|data:|https?:|#|%23))/.test(css)
    )
      sheets[`${base}assets/${name}`] = css
  }
  return sheets
}

/** How long a replaced sheet stays in the build, for pages cached before the deploy that replaced it: a CDN's longest day. */
const KEEP_SHEETS_MS = 30 * 864e5

/**
 * Writes the build's combined stylesheets beside the chunks' own. A route's list is what its chunks import, the entry's
 * included, plus the sheets of the islands in the files it imports.
 */
export function combineSheets(dir, bundle, manifest, abs, islands) {
  const chunks = Object.values(bundle).filter((f) => f.type === 'chunk')
  const holding = (id) => chunks.filter((c) => c.moduleIds.some((m) => m.split('?')[0] === id))
  const sheetsOf = (start, seen = new Set()) =>
    start.flatMap((c) => {
      if (seen.has(c)) return []
      seen.add(c)
      return [
        ...(c.viteMetadata?.importedCss ?? []),
        ...sheetsOf(c.imports.map((i) => bundle[i]).filter(Boolean), seen),
      ]
    })
  const entry = sheetsOf(chunks.filter((c) => c.isEntry))
  const routes = manifest.routes
    .map((r) => {
      const levels = [
        ...manifest.layouts.filter((l) => r.layouts.includes(l.id)).map((l) => abs(l.file)),
        abs(r.file),
      ]
      const files = reach(levels)
      const held = islands.filter((i) => files.has(i.file)).map((i) => i.file)
      return [...new Set([...entry, ...sheetsOf([...levels, ...held].flatMap(holding))])]
    })
    .filter((list) => list.length)
  const plan = planSheets(routes, (name) => readFileSync(join(dir, name), 'utf8'))
  for (const [name, css] of Object.entries(plan.files)) writeFileSync(join(dir, name), css)
  return plan
}

/**
 * The first-paint table of the build's sheets (node/purge.mjs), and the last builds' combined sheets kept beside them: a
 * page cached across a deploy links the ones it was built with. `.kerf/sheets` carries them, so CI has to keep that folder.
 */
export function sheetPieces(outDir, base, plan, keep, root) {
  const dir = join(outDir, 'assets')
  const href = (name) => `${base}${name}`
  const names = [...new Set([plan.shared, ...plan.routes].filter(Boolean).flatMap((s) => s.has))]
  const sheets = names
    .map((n) => [href(n), readFileSync(join(outDir, n), 'utf8')])
    .filter(([, css]) => !/<\/style|<!--/i.test(css))
  const old = join(root, '.kerf/sheets')
  mkdirSync(old, { recursive: true })
  for (const f of Object.keys(plan.files))
    writeFileSync(join(old, f.replace('assets/', '')), plan.files[f])
  for (const f of readdirSync(old)) {
    if (Date.now() - statSync(join(old, f)).mtimeMs > KEEP_SHEETS_MS) rmSync(join(old, f))
    else if (!existsSync(join(dir, f))) writeFileSync(join(dir, f), readFileSync(join(old, f)))
  }
  const shape = (s) => s && { href: href(s.file), has: s.has.map(href) }
  return { ...pieces(sheets, keep), shared: shape(plan.shared), routes: plan.routes.map(shape) }
}
