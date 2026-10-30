// `weft dev`, `weft build` and `weft routes` for an app with src/routes: they run @weft/start (research 25 §6–7).
// @weft/start resolves from the app first (its own version), then from this workspace.

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { diagnostic, locate } from './diag.mjs'
import { loadConfig } from './load-config.mjs'

async function start(root, sub) {
  let file
  try {
    file = createRequire(join(root, 'package.json')).resolve(`@weft/start/${sub}`)
  } catch {
    const sibling = new URL(`../../start/src/${sub}.mjs`, import.meta.url)
    if (!existsSync(sibling)) throw Object.assign(new Error('@weft/start is not installed in this project'), { code: 'E_USAGE' })
    file = sibling
  }
  return import(typeof file === 'string' ? pathToFileURL(file).href : file.href)
}

/** The config's `site` (metadata defaults), and the config diagnostics. */
async function site(root) {
  const loaded = await loadConfig(root)
  return { site: loaded.config?.site ?? {}, diagnostics: loaded.diagnostics }
}

export async function devCommand(root, { port } = {}) {
  const { dev } = await start(root, 'app')
  const server = await dev({ root, ...(await site(root)), port })
  return server
}

export async function buildCommand(root, { preset = 'node' } = {}) {
  const { build } = await start(root, 'app')
  const t = performance.now()
  const { output } = await build({ root, ...(await site(root)), preset, logLevel: 'warn' })
  return { ok: true, preset, output, ms: Math.round(performance.now() - t) }
}

/** Every route's merged metadata, tags and card mode (`--meta`), or just the route table. */
export async function routesCommand(root, { meta, preset } = {}) {
  const config = await site(root)
  if (meta) {
    const { routesMeta } = await start(root, 'inspect')
    const result = await routesMeta({ root, site: config.site, preset })
    const text = f => { try { return readFileSync(join(root, f), 'utf8') } catch { return '' } }
    const own = result.diagnostics.map(({ code, severity, file, route, why }) =>
      ({ ...diagnostic({ code, severity, file, why, ...locate(text(file), 'meta') }), route }))
    return { ...result, diagnostics: [...config.diagnostics, ...own] }
  }
  const { scanRoutes, filePath } = await start(root, 'routes')
  const manifest = scanRoutes(root)
  return {
    version: 1, ok: true, problems: manifest.problems,
    routes: manifest.routes.map(r => ({ path: r.kind === 'page' ? filePath(manifest, r) : r.kind, kind: r.kind, file: r.file, layouts: r.layouts, params: r.params, card: r.card ?? null })),
    diagnostics: config.diagnostics,
  }
}
