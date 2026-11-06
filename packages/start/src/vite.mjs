// weftStart() for Vite 8 (research 25 §6): file routes as virtual modules, the server and client entries Nitro's Vite
// plugin builds (`nitro()` from `nitro/vite` goes next to it), and route modules without their server exports in
// the client build. Used through `weft dev` / `weft build`, which add weft() and nitro() and pass the config's `site`.
//
//   virtual:weft/routes         server: the manifest, every route, layout and card module, and each one's stylesheets
//                               client: the route table and a chunk loader per route id (load/meta/prerender stripped)
//   virtual:weft/app            server: site config, build id, card fonts (bytes, so every preset can read them)
//   virtual:weft/entry-server   the Nitro SSR entry: `export default { fetch }`
//   virtual:weft/entry-client   the client entry: `start()`, unless the app has src/entry.client.ts
//   virtual:weft/fns            server: imports every server module, so `/_weft/fn/<id>` knows every function
//   virtual:weft/context        server: `src/context.server.ts`'s default export (the app's part of `ctx`)
//   virtual:weft/auth           server: `src/auth.server.ts`'s default export, mounted at its base path
//   virtual:weft/migrations     server: `drizzle/`'s migrations, embedded (a bundle can't read a folder on every preset)
//   virtual:weft/media          server: the `media.server` provider when one is bound (research 29 §6)
//   virtual:weft/realtime       server: `src/realtime.server.ts`'s default export (the bus, origins and limits)
//   virtual:weft/extensions     server: each `server.extension` provider with its `src/<key>.server.ts` (extension.ts)
//
// Server modules (`src/server/**`, `*.server.ts`, research 27 §2): each `query`/`mutation`/`stream`/`channel` export
// gets an `$id` on both sides; the client build replaces the module with stubs that keep only `optimistic`, the
// query's shape and a shared state's `initial`.
//
// Stylesheets: routes are chunks the entry only reaches through `import()`, so `?assets=client` names just the entry's
// CSS. Each route and layout's own CSS comes from Nitro's assets manifest (build) or the client module graph (dev);
// the server links the entry's and those of the levels it matched, so nothing paints before its styles and other
// routes' CSS stays out of the page. In dev the links stand in for Vite's injected `<style>`s and HMR updates them.
// A build keeps each chunk's sheet for client navigation and writes a shared sheet (what every route has) and one sheet
// per route for the rest, hashed and cached for good. Each page carries the part of those its first paint needs
// (`firstPaint`) and links them at the end of its shell, where they block nothing above and hold whatever streams after.
// `site: { criticalCss: false }` splits by chunk and puts them in the HTML (`inlineSheets`, inline.mjs): whole while the
// document fits the first flight, else the rules the page's HTML reaches, with the sheets behind them as links that
// don't hold the paint. `site: { inlineCss: false }` keeps plain links.

import { existsSync } from 'node:fs'
import { relative } from 'node:path'
import { createState } from './vite/state.mjs'
import { shapeSignature } from './vite/route-modules.mjs'
import { entryCandidate, entryCssSignature, entryWatchLifecycle } from './vite/shape-entry-css.mjs'
import { V } from './vite/shared.mjs'
import { configHook, writeBundle, renderChunk, configResolved } from './vite/config-hooks.mjs'
import { configureServer, hotUpdate } from './vite/dev-hooks.mjs'
import { resolveId, load, transform, api } from './vite/module-hooks.mjs'
export { assetsOnly } from './vite/assets.mjs'
export { inlineSheets, sheetPieces } from './vite/sheets.mjs'
export { stripServerExports } from './vite/syntax.mjs'
export { isServerModule, fnId, withIds, clientStubs } from './vite/server-functions.mjs'
export { scanRoutes, routeTypes } from './routes.mjs'
export { here as startDir } from './vite/shared.mjs'

/** Reload when an edit changes shape metadata embedded in the client route module. */
export function shapeHotUpdate(state, modes, next) {
  return async function (update) {
    if (this.environment.config.consumer === 'client') {
      const pending = state.shapeScanActive === state.shapeScanGeneration &&
        state.shapeScanActive !== undefined
      if (pending) state.shapeScanGeneration++
      const owners = [...(state.shapeOverrideDependencies ?? [])].flatMap(([file, routes]) =>
        entryCandidate(new Set([file]), update.file) ? [...routes] : [],
      )
      if (owners.length) {
        if (update.type === 'update' && entryCandidate(state.shapeEntryMissing, update.file) &&
            existsSync(update.file))
          await this.environment.pluginContainer.watchChange(update.file, { event: 'create' })
        const graph = this.environment.moduleGraph
        for (const file of owners) {
          const id = `\0virtual:weft/shape-override/${encodeURIComponent(file)}.tsx`
          const asset = graph.getModuleById(id)
          if (asset) graph.invalidateModule(asset)
        }
        const mod = graph.getModuleById('\0' + V.routes)
        if (mod) graph.invalidateModule(mod)
        state.vite?.ws.send({ type: 'full-reload' })
        return []
      }
      const rel = relative(state.root, update.file).split('\\').join('/')
      const entrySignatures = state.shapeEntrySignatures
      if (entrySignatures?.has(update.file)) {
        let signature
        try {
          signature = entryCssSignature(update.file)
        } catch {
          signature = 'invalid'
        }
        const previous = entrySignatures.get(update.file)
        entrySignatures.set(update.file, signature)
        if (previous !== signature) {
          const graph = this.environment.moduleGraph
          const mod = graph.getModuleById('\0' + V.routes)
          if (mod) graph.invalidateModule(mod)
          state.vite?.ws.send({ type: 'full-reload' })
          return []
        }
      }
      const candidateEvent = (update.type === 'create' || update.type === 'delete') &&
        entryCandidate(state.shapeEntryCandidates, update.file)
      const missingUpdate = update.type === 'update' &&
        entryCandidate(state.shapeEntryMissing, update.file)
      if (candidateEvent || missingUpdate) {
        // A watched missing path may arrive as an update; Vite clears negative resolution on create.
        if (missingUpdate && existsSync(update.file))
          await this.environment.pluginContainer.watchChange(update.file, { event: 'create' })
        const graph = this.environment.moduleGraph
        const mod = graph.getModuleById('\0' + V.routes)
        if (mod) graph.invalidateModule(mod)
        state.vite?.ws.send({ type: 'full-reload' })
        return []
      }
      const levels = [...state.manifest.routes, ...state.manifest.layouts]
      if (levels.some((level) => level.file === rel) || state.clientEntry?.() === update.file) {
        let mode
        try {
          mode = shapeSignature(update.file)
        } catch {
          mode = 'invalid'
        }
        const before = modes.get(rel)
        modes.set(rel, mode)
        if (before !== mode) {
          const graph = this.environment.moduleGraph
          const mod = graph.getModuleById('\0' + V.routes)
          if (mod) graph.invalidateModule(mod)
          state.vite?.ws.send({ type: 'full-reload' })
          return []
        }
      }
      if (pending) {
        const graph = this.environment.moduleGraph
        const mod = graph.getModuleById('\0' + V.routes)
        if (mod) graph.invalidateModule(mod)
        state.vite?.ws.send({ type: 'full-reload' })
        return []
      }
    }
    return next.call(this, update)
  }
}

/**
 * @param {{ root?: string, site?: import('@weft-js/core/ssr').Site, routesDir?: string, timeout?: number, hold?: number, fonts?: string[], hydration?: 'lazy' | 'partial' | 'full' }} [options]
 */
export default function weftStart(options = {}) {
  const state = createState(options)
  const modes = new Map()
  const configure = configureServer(state)
  return [
    {
      name: 'weft:start',
      enforce: 'pre',
      config: configHook(state),
      configResolved: configResolved(state),
      api: api(state),
    },
    {
      name: 'weft:start:sheets',
      enforce: 'pre',
      writeBundle: writeBundle(state),
      renderChunk: renderChunk(state),
    },
    {
      name: 'weft:start:dev',
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
      hotUpdate: shapeHotUpdate(state, modes, hotUpdate(state)),
    },
    {
      name: 'weft:start:modules',
      enforce: 'pre',
      resolveId: resolveId(state),
      load: load(state),
      transform: transform(state),
    },
  ]
}
