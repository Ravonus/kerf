// Everything the site says that comes from elsewhere in the repo is generated here, so it can't drift. Docs are `weft docs`'
// own pages plus a few files; numbers are evals/. Output is gitignored: src/generated for the routes, public for files
// served as they are (`.md` twins, llms.txt, search indexes).
import 'node:crypto'
import { mkdirSync, rmSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import 'node:zlib'
import '../../../packages/cli/src/docs.mjs'
import '../../../packages/cli/src/catalog.mjs'
import '../../../packages/cli/src/weft.mjs'
import '../../../packages/start/src/derive.mjs'
import '../toolkit.mjs'
import { reportSampleWidths } from '../sample-width.mjs'

// warp-core's source imports without extensions, for bundlers; here Node reads it directly.
registerHooks({
  resolve(spec, context, next) {
    try {
      return next(spec, context)
    } catch (e) {
      if (spec.startsWith('.')) return next(`${spec}.ts`, context)
      throw e
    }
  },
})
const { buildIndex, highlight, markdownToHtml } =
  await import('../../../packages/warp-core/src/index.ts')
const { level, PALETTE } = await import('../../src/lib/field.ts')
const { GROUPS } = await import('../../src/toolkit/docs/index.ts')

const site = join(dirname(fileURLToPath(new URL('../content.mjs', import.meta.url))), '..')
const repo = join(site, '..')
const out = join(site, 'src/generated')
const pub = join(site, 'public')
rmSync(join(pub, 'search'), { recursive: true, force: true })
// `docs/` held the twins before the section became Learn and Reference: old addresses now redirect (src/routes/docs).
for (const d of ['docs', 'learn', 'reference'])
  rmSync(join(pub, d), { recursive: true, force: true })
for (const d of [out, join(pub, 'search'), join(pub, 'learn'), join(pub, 'reference/codes')])
  mkdirSync(d, { recursive: true })

export {
  buildIndex,
  highlight,
  markdownToHtml,
  level,
  PALETTE,
  GROUPS,
  site,
  repo,
  out,
  pub,
  reportSampleWidths,
}
