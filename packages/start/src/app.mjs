// `weft dev` and `weft build` for an app with src/routes (research 25 §6): Vite 8 with weft() (hydratable output),
// weftStart() and Nitro's Vite plugin. A vite.config in the app is merged in. The CLI passes the config's `site`.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createBuilder, createServer } from 'vite'
import { nitro } from 'nitro/vite'
import weft from '@weft-js/core/vite'
import { devRunner, devSockets } from './dev-runtime.mjs'
import { holdsSockets } from './live-target.mjs'
import weftStart, { startDir } from './vite.mjs'

/** An app with a `channel` or `sharedState`: only those pay for crossws in the server bundle (research 32 §1). */
function usesSockets(root) {
  const src = join(root, 'src')
  if (!existsSync(src)) return false
  return readdirSync(src, { recursive: true, withFileTypes: true }).some(
    (f) =>
      f.isFile() &&
      /\.[cm]?[jt]sx?$/.test(f.name) &&
      /\b(channel|sharedState)\s*[(<]/.test(readFileSync(join(f.parentPath, f.name), 'utf8')),
  )
}

function config({
  root,
  site,
  hydration,
  preset,
  port,
  logLevel,
  command,
  nitro: nitroOptions = {},
}) {
  root = resolve(root)
  const sockets = usesSockets(root)
  const runner = devRunner(sockets)
  const user = ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs']
    .map((f) => join(root, f))
    .find(existsSync)
  return {
    root,
    configFile: user ?? false,
    logLevel,
    server: { port: port ?? 5173, strictPort: port !== undefined },
    // A function host can't hold a socket: the page goes straight to SSE, and a channel says `unavailable` (R024)
    ...(command === 'build' && {
      define: { __WEFT_SOCKETS__: JSON.stringify(holdsSockets(preset)) },
    }),
    plugins: [
      weft({ hydratable: true }),
      weftStart({ root, site, hydration }),
      runner && devSockets(),
      nitro({
        preset,
        // Every app gets this: built assets ship as .br and .gz next to the file, and Nitro picks by Accept-Encoding.
        compressPublicAssets: { gzip: true, brotli: true },
        ...(site?.headers && {
          routeRules: Object.fromEntries(
            Object.entries(site.headers).map(([path, headers]) => [path, { headers }]),
          ),
        }),
        ...(sockets && { features: { websocket: true } }),
        ...(runner && { devServer: { runner } }),
        // Build mode for share cards (research 20 §4.3): the server lists them and Nitro's prerender writes the PNGs.
        prerender: { routes: ['/_weft/og-routes'], failOnError: true },
        // Prerendered cards are static files at content-addressed URLs: immutable. The rule names each file (a
        // `/_weft/og/**` rule would also override the handler's no-cache for a stale `?v=` on demand). Prerender runs
        // before Nitro bundles the server, so rules added when it is done are in the build. (Dev sends no-store.)
        ...(command === 'build' && {
          hooks: immutableCards(),
          plugins: [fileURLToPath(new URL('./range.mjs', import.meta.url))],
        }),
        // The media route: sharp's addon, and css-tree and csso (under svgo) read JSON from their packages at runtime.
        ...(existsSync(join(root, '.weft/slots/media.server.ts')) && {
          traceDeps: ['css-tree*', 'csso*', 'sharp*'],
        }),
        ...nitroOptions,
      }),
    ],
  }
}

/** Where the last build's Nitro wrote, known once it prerenders: a preset may move it (netlify serves `dist`). */
let wrote

function immutableCards() {
  let built
  return {
    'prerender:generate'(_route, instance) {
      built = instance
      const { dir, publicDir } = instance.options.output
      wrote = publicDir.startsWith(dir) ? dir : publicDir
    },
    'prerender:done'({ prerenderedRoutes }) {
      if (!built) return
      for (const r of prerenderedRoutes) {
        if (r.route.startsWith('/_weft/og/') && r.route.endsWith('.png'))
          built.options.routeRules[r.route] = {
            headers: { 'cache-control': 'public, max-age=31536000, immutable' },
          }
      }
      built.routing.sync()
    },
  }
}

/** Start the dev server; resolves with it once it listens. */
export async function dev(options) {
  const server = await createServer(config(options))
  await server.listen()
  return server
}

/** Build client and server for `preset` (node by default; bun, deno_server…), into `.output/` unless the preset moves it. */
export async function build(options) {
  process.env.WEFT_START_DIR ??= startDir // for the share cards a build draws (og/native.mjs)
  const builder = await createBuilder(config({ ...options, command: 'build' }))
  wrote = undefined
  await builder.buildApp()
  return { output: wrote ?? join(resolve(options.root), '.output') }
}
