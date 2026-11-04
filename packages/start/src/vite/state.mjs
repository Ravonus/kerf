import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { solve } from '@weft-js/core/hydration'
import { scanRoutes } from '../routes.mjs'
import { scanServerModules } from './server-functions.mjs'
import { usesShapes } from './dev.mjs'
import { PRELOAD, V } from './shared.mjs'

/** Partial hydration's view of the project, redone in dev when a file it read changed. */
async function hydration(s, ctx) {
  const { options } = s
  if (options.hydration === 'full' || !s.compile) return undefined
  if (s.plan && !s.dev) return s.plan
  if (s.plan && Date.now() - s.planned < 200) return s.plan
  s.planned = Date.now()
  if (s.plan) {
    const p = await s.plan
    if (
      !p.stamps.some(
        (f) => statSync(f, { throwIfNoEntry: false })?.mtimeMs !== s.facts.get(f)?.mtime,
      )
    )
      return p
  }
  const entries = [...s.manifest.routes, ...s.manifest.layouts].map((r) => s.abs(r.file))
  s.plan = solve({
    entries,
    lazy: (options.hydration ?? 'lazy') === 'lazy',
    transform: s.compile,
    rel: (f) => relative(s.root, f).split('\\').join('/'),
    cache: s.facts,
    resolve: async (spec, from) => (await ctx.resolve(spec, from, { skipSelf: true }))?.id,
  })
  const done = await s.plan
  try {
    mkdirSync(join(s.root, '.weft'), { recursive: true })
    writeFileSync(
      join(s.root, '.weft', 'hydration.json'),
      `${JSON.stringify({ islands: done.islands.map((i) => i.id), loads: done.loads, preload: PRELOAD, diagnostics: done.diagnostics, files: done.report }, null, 2)}\n`,
    )
  } catch {}
  return done
}

/** Read the query shape table once per edit. */
async function shapeTable(s, ctx) {
  if (!usesShapes(s.root)) return undefined
  const stamp = s.serverModules.map((f) => statSync(s.abs(f)).mtimeMs).join()
  if (s.shapes?.stamp === stamp) return s.shapes.table
  try {
    const { readShapes } = await import('../contract.mjs')
    s.shapes = { stamp, table: await readShapes({ root: s.root, site: s.options.site }) }
    return s.shapes.table
  } catch (e) {
    ctx.warn(
      `the query shapes couldn't be read, so skeletons only have last-seen shapes: ${e.message}`,
    )
  }
}

export function createState(options) {
  const s = {
    options,
    root: options.root ?? process.cwd(),
    dev: false,
    build: '',
    serverModules: [],
    loaders: new Map(),
    stubs: new Map(),
    planned: 0,
    facts: new Map(),
  }
  s.abs = (f) => resolve(s.root, f)
  s.id = (v) => (v.startsWith('virtual:') ? '\0' + v : v)
  s.scan = () => {
    s.serverModules = scanServerModules(s.root)
    return (s.manifest = scanRoutes(
      s.root,
      options.routesDir ? resolve(s.root, options.routesDir) : undefined,
    ))
  }
  s.hydration = (ctx) => hydration(s, ctx)
  s.shapeTable = (ctx) => shapeTable(s, ctx)
  s.clientEntry = () =>
    existsSync(join(s.root, 'src', 'entry.client.ts'))
      ? join(s.root, 'src', 'entry.client.ts')
      : V.client
  return s
}
