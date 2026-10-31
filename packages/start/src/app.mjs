// `weft dev` and `weft build` for an app with src/routes (research 25 §6): Vite 8 with weft() (hydratable output),
// weftStart() and Nitro's Vite plugin. A vite.config in the app is merged in. The CLI passes the config's `site`.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createBuilder, createServer } from 'vite'
import { nitro } from 'nitro/vite'
import weft from 'weft/vite'
import weftStart from './vite.mjs'

/** An app with a `channel` or `sharedState`: only those pay for crossws in the server bundle (research 32 §1). */
function usesSockets(root) {
  const src = join(root, 'src')
  if (!existsSync(src)) return false
  return readdirSync(src, { recursive: true, withFileTypes: true }).some(f => f.isFile() && /\.[cm]?[jt]sx?$/.test(f.name) && /\b(channel|sharedState)\s*[(<]/.test(readFileSync(join(f.parentPath, f.name), 'utf8')))
}

function config({ root, site, preset, port, logLevel, command, nitro: nitroOptions = {} }) {
  root = resolve(root)
  const user = ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs'].map(f => join(root, f)).find(existsSync)
  return {
    root,
    configFile: user ?? false,
    logLevel,
    server: { port: port ?? 5173, strictPort: port !== undefined },
    plugins: [
      weft({ hydratable: true }),
      weftStart({ root, site }),
      nitro({
        preset,
        ...(usesSockets(root) && { features: { websocket: true } }),
        // Build mode for share cards (research 20 §4.3): the server lists them and Nitro's prerender writes the PNGs.
        prerender: { routes: ['/_weft/og-routes'], failOnError: true },
        // Prerendered cards are static files at content-addressed URLs: immutable. The rule names each file (a
        // `/_weft/og/**` rule would also override the handler's no-cache for a stale `?v=` on demand). Prerender runs
        // before Nitro bundles the server, so rules added when it is done are in the build. (Dev sends no-store.)
        ...(command === 'build' && { hooks: immutableCards(), plugins: [fileURLToPath(new URL('./range.mjs', import.meta.url))] }),
        // The media route: sharp's addon, and css-tree (under svgo) reads JSON from its package at runtime.
        ...(existsSync(join(root, '.weft/slots/media.server.ts')) && { traceDeps: ['css-tree*', 'sharp*'] }),
        ...nitroOptions,
      }),
    ],
  }
}

function immutableCards() {
  let nitro
  return {
    'prerender:generate'(_route, instance) { nitro = instance },
    'prerender:done'({ prerenderedRoutes }) {
      if (!nitro) return
      for (const r of prerenderedRoutes) {
        if (r.route.startsWith('/_weft/og/') && r.route.endsWith('.png')) nitro.options.routeRules[r.route] = { headers: { 'cache-control': 'public, max-age=31536000, immutable' } }
      }
      nitro.routing.sync()
    },
  }
}

/** Start the dev server; resolves with it once it listens. */
export async function dev(options) {
  const server = await createServer(config(options))
  await server.listen()
  return server
}

/** Build client and server into `.output/` for `preset` (node by default; bun, deno_server…). */
export async function build(options) {
  const builder = await createBuilder(config({ ...options, command: 'build' }))
  await builder.buildApp()
  return { output: join(resolve(options.root), '.output') }
}
