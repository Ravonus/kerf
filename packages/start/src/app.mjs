// `kerf dev` and `kerf build` for an app with src/routes (research 25 §6): Vite 8 with kerf() (hydratable output),
// kerfStart() and Nitro's Vite plugin. A vite.config in the app is merged in. The CLI passes the config's `site`.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createBuilder, createServer } from 'vite'
import { nitro } from 'nitro/vite'
import kerf from '@kerf/core/vite'
import { devRunner, devSockets } from './dev-runtime.mjs'
import { pageSockets } from './live-target.mjs'
import kerfStart, { startDir } from './vite.mjs'

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
    // Streams and live queries go over SSE unless the server answers a socket; a channel says `unavailable` (R024)
    define: {
      __KERF_SOCKETS__: JSON.stringify(
        pageSockets({ sockets, build: command === 'build', preset }),
      ),
    },
    plugins: [
      kerf({ hydratable: true, csp: site?.csp }),
      kerfStart({ root, site, hydration }),
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
        prerender: { routes: ['/_kerf/og-routes'], failOnError: true },
        // Prerendered cards are static files at content-addressed URLs: immutable. The rule names each file (a
        // `/_kerf/og/**` rule would also override the handler's no-cache for a stale `?v=` on demand). Prerender runs
        // before Nitro bundles the server, so rules added when it is done are in the build. (Dev sends no-store.)
        ...(command === 'build' && {
          hooks: immutableCards(),
          plugins: [fileURLToPath(new URL('./range.mjs', import.meta.url))],
        }),
        ...traced(root),
        ...nitroOptions,
      }),
    ],
  }
}

/**
 * Packages the server loads by name at runtime, which Nitro can't see to copy into the build: the media route's sharp
 * (and css-tree and csso, under svgo, read JSON from their packages), and nodemailer for SMTP when the app has it.
 */
function traced(root) {
  const deps = [
    ...(existsSync(join(root, '.kerf/slots/media.server.ts'))
      ? ['css-tree*', 'csso*', 'sharp*']
      : []),
    ...(existsSync(join(root, 'node_modules/nodemailer')) ? ['nodemailer*'] : []),
  ]
  return deps.length ? { traceDeps: deps } : {}
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
        if (r.route.startsWith('/_kerf/og/') && r.route.endsWith('.png'))
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
  process.env.KERF_START_DIR ??= startDir // for the share cards a build draws (og/native.mjs)
  const builder = await createBuilder(config({ ...options, command: 'build' }))
  wrote = undefined
  await builder.buildApp()
  return { output: wrote ?? join(resolve(options.root), '.output') }
}
