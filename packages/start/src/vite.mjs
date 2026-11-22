// Start supplies Nitro's virtual entries and the file-routes manifest. Client modules reach
// routes through dynamic imports and drop server-only exports and function bodies.
// Route CSS follows the matched layouts and routes from the client graph in dev, or Nitro's
// asset manifest in a build. Dev links let Vite swap the existing sheets during HMR.

import { existsSync } from 'node:fs'
import { relative } from 'node:path'
import { createState } from './vite/state.mjs'
import { shapeSignature } from './vite/route-modules.mjs'
import { entryCandidate, entryCssSignature, entryWatchLifecycle } from './vite/shape-entry-css.mjs'
import { V } from './vite/shared.mjs'
import {
  configHook,
  writeBundle,
  generateBundle,
  renderChunk,
  configResolved,
} from './vite/config-hooks.mjs'
import { configureServer, hotUpdate } from './vite/dev-hooks.mjs'
import { resolveId, load, transform, api } from './vite/module-hooks.mjs'
import { normalizeViteAssets } from './vite/nitro-output.mjs'
import { sourceMapOptions, viteManifests } from './vite/output-manifests.mjs'
export { assetsOnly } from './vite/assets.mjs'
export { inlineSheets, sheetPieces } from './vite/sheets.mjs'
export { stripServerExports } from './vite/syntax.mjs'
export { isServerModule, fnId, withIds, clientStubs } from './vite/server-functions.mjs'
export { scanRoutes, routeTypes } from './routes.mjs'
export { here as startDir } from './vite/shared.mjs'

/** An unparseable save takes ordinary HMR so the mounted page survives the error. */
const parsed = (signature, file, source) => {
  try {
    return signature(file, source)
  } catch {
    return undefined
  }
}

function invalidateShapes(graph) {
  const mod = graph.getModuleById('\0' + V.routes)
  if (mod) graph.invalidateModule(mod)
}

function reloadShapes(state, graph) {
  invalidateShapes(graph)
  state.vite?.ws.send({ type: 'full-reload' })
  return []
}

/** Reload when an edit changes shape metadata embedded in the client route module. */
export function shapeHotUpdate(state, modes, next) {
  return async function (update) {
    let source
    if (this.environment.config.consumer === 'client') {
      const rel = relative(state.root, update.file).split('\\').join('/')
      const graph = this.environment.moduleGraph
      // Reports are written by the dev server itself and cannot change the shapes.
      const report = rel === '.kerf/hydration.json' || rel === '.kerf/dev.json'
      const pending =
        !report &&
        state.shapeScanActive === state.shapeScanGeneration &&
        state.shapeScanActive !== undefined
      if (pending) state.shapeScanGeneration++
      const owners = [...(state.shapeOverrideDependencies ?? [])].flatMap(([file, routes]) =>
        entryCandidate(new Set([file]), update.file) ? [...routes] : [],
      )
      if (owners.length) {
        if (
          update.type === 'update' &&
          entryCandidate(state.shapeEntryMissing, update.file) &&
          existsSync(update.file)
        )
          await this.environment.pluginContainer.watchChange(update.file, { event: 'create' })
        for (const file of owners) {
          const id = `\0virtual:kerf/shape-override/${encodeURIComponent(file)}.tsx`
          const asset = graph.getModuleById(id)
          if (asset) graph.invalidateModule(asset)
        }
        return reloadShapes(state, graph)
      }
      const entrySignatures = state.shapeEntrySignatures
      const hasEntrySignature = entrySignatures?.has(update.file)
      const levels = [...state.manifest.routes, ...state.manifest.layouts]
      const shapeFile =
        levels.some((level) => level.file === rel) || state.clientEntry?.() === update.file
      // Vite waits for a truncated file to finish saving before it returns the source.
      if (update.type === 'update' && (hasEntrySignature || shapeFile))
        source = await update.read?.()
      if (hasEntrySignature) {
        const signature = parsed(entryCssSignature, update.file, source)
        const previous = entrySignatures.get(update.file)
        if (signature !== undefined) entrySignatures.set(update.file, signature)
        if (signature !== undefined && previous !== signature) return reloadShapes(state, graph)
      }
      const candidateEvent =
        (update.type === 'create' || update.type === 'delete') &&
        entryCandidate(state.shapeEntryCandidates, update.file)
      const missingUpdate =
        update.type === 'update' && entryCandidate(state.shapeEntryMissing, update.file)
      if (candidateEvent || missingUpdate) {
        // A watched missing path may arrive as an update; Vite clears negative resolution on create.
        if (missingUpdate && existsSync(update.file))
          await this.environment.pluginContainer.watchChange(update.file, { event: 'create' })
        return reloadShapes(state, graph)
      }
      if (shapeFile) {
        const mode = parsed(shapeSignature, update.file, source)
        const before = modes.get(rel)
        if (mode !== undefined) modes.set(rel, mode)
        if (mode !== undefined && before !== mode) return reloadShapes(state, graph)
      }
      if (pending) {
        // A save can supersede a scan without changing its shape metadata. Let Vite hot-update
        // the edited module so a mounted route keeps its document, even while the server rebuilds.
        invalidateShapes(graph)
      }
    }
    return next.call(this, update, source)
  }
}

/**
 * @param {{ root?: string, site?: import('./shell/routes').ShellSite, routesDir?: string, timeout?: number, hold?: number, fonts?: string[], hydration?: 'lazy' | 'partial' | 'full' }} [options]
 */
export default function kerfStart(options = {}) {
  const state = createState(options)
  const modes = new Map()
  const configure = configureServer(state)
  return [
    {
      name: 'kerf:start',
      enforce: 'pre',
      config: configHook(state),
      configResolved: configResolved(state),
      api: api(state),
      buildApp: normalizeViteAssets(state),
    },
    {
      name: 'kerf:start:sheets',
      enforce: 'pre',
      writeBundle: writeBundle(state),
      generateBundle: generateBundle(state),
      renderChunk: renderChunk(state),
    },
    {
      name: 'kerf:start:dev',
      enforce: 'pre',
      configureServer(server) {
        for (const level of [...state.manifest.routes, ...state.manifest.layouts]) {
          try {
            modes.set(level.file, shapeSignature(state.abs(level.file)))
          } catch {
            modes.set(level.file, 'invalid')
          }
        }
        const entry = state.clientEntry()
        if (!entry.startsWith('virtual:')) {
          const rel = relative(state.root, entry).split('\\').join('/')
          try {
            modes.set(rel, shapeSignature(entry))
          } catch {
            modes.set(rel, 'invalid')
          }
        }
        const configured = configure(server)
        entryWatchLifecycle(state, server, modes)
        return configured
      },
      closeServer() {
        state.closeRoutes?.()
      },
      hotUpdate: shapeHotUpdate(state, modes, hotUpdate(state)),
    },
    {
      name: 'kerf:start:modules',
      enforce: 'pre',
      resolveId: resolveId(state),
      load: load(state),
      transform: transform(state),
    },
    {
      name: 'kerf:start:output-manifests',
      apply: 'build',
      enforce: 'post',
      generateBundle: viteManifests(state),
      outputOptions(output) {
        if (this.environment.config.consumer === 'client')
          return sourceMapOptions(output, state.pathFor)
        if (this.environment.name !== 'nitro' && output.sourcemap)
          return { ...output, sourcemapExcludeSources: true }
      },
    },
  ]
}

export { checkShellContracts, requireShellContracts } from './vite/shell-contracts.mjs'
