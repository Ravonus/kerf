// `kerf dev` and `kerf build` for an app with src/routes: Vite 8 with kerf() (hydratable output),
// kerfStart() and Nitro's Vite plugin. A vite.config in the app is merged in. The CLI passes the config's `site`.

import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createBuilder, createServer } from 'vite'
import { nitro } from 'nitro/vite'
import kerf from '@kerf-js/core/vite'
import { devRunner, devRuntime } from './dev-runtime.mjs'
import { pageSockets } from './live-target.mjs'
import kerfStart, { startDir } from './vite.mjs'
import { ownNodePreset } from './server/node-preset.mjs'
import { buildDate, finalizeBuild, nitroOutput } from './vite/nitro-output.mjs'
import { labelChunkGroups } from './vite/shared.mjs'
import { externalAddons, traceDeps } from './vite/trace-deps.mjs'

/** Enable crossws only for apps that declare a channel or shared state. */
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

/** Nitro reads a falsy port as 3000. `port: 0` asks the OS for a free one, so dev servers can run side by side. */
const anyPort = { name: 'kerf:any-port', config: () => ({ server: { port: 0 } }) }

function config({
  root,
  site,
  hydration,
  preset,
  port,
  logLevel,
  command,
  nitro: nitroOptions = {},
  production,
  refreshPlugins,
}) {
  root = command === 'build' ? realpathSync(root) : resolve(root)
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
      kerf({ hydratable: site?.render !== 'shell', csp: site?.csp }),
      kerfStart({ root, site, hydration }),
      refreshPlugins && devRuntime(refreshPlugins),
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
        // The server lists share cards so Nitro can prerender the PNGs.
        ...(site?.render !== 'shell' && {
          prerender: { routes: ['/_kerf/og-routes'], failOnError: true },
        }),
        // Prerendered cards are static files at content-addressed URLs: immutable. The rule names each file (a
        // `/_kerf/og/**` rule would also override the handler's no-cache for a stale `?v=` on demand). Prerender runs
        // before Nitro bundles the server, so rules added when it is done are in the build. (Dev sends no-store.)
        ...traceDeps(root),
        ...nitroOptions,
        ...(command === 'build' && productionHooks(nitroOptions, site, production)),
      }),
      port === 0 && anyPort,
    ],
  }
}

/** Add Start's build bookkeeping without replacing the host preset's publication finalizer. */
function productionHooks(nitroOptions, site, production) {
  const { compiled, ...buildHooks } = nitroOptions.hooks ?? {}
  return {
    modules: [
      ...(nitroOptions.modules ?? []),
      (instance) => {
        instance.hooks.hook('compiled', async (built) => {
          production.output = built.options.output
          await compiled?.(built)
        })
      },
    ],
    hooks: {
      ...(site?.render !== 'shell' && immutableCards()),
      ...buildHooks,
      async 'build:before'(instance) {
        await buildHooks['build:before']?.(instance)
        ownNodePreset(instance, site)
      },
      async 'rollup:before'(instance, bundle) {
        await buildHooks['rollup:before']?.(instance, bundle)
        shapeBundle(instance, bundle, production.date)
      },
    },
    plugins: [
      fileURLToPath(new URL('./range.mjs', import.meta.url)),
      ...(nitroOptions.plugins ?? []),
    ],
  }
}

/** What Start adds to each bundle Nitro builds: the prerender's and the server's. */
function shapeBundle(instance, bundle, date) {
  bundle.plugins.push(nitroOutput(instance, date))
  // the prerender bundle resolves without tracing; the server's bundle traces the addon into `.output`
  if (instance.options.preset === 'nitro-prerender') bundle.plugins.push(externalAddons())
  labelChunkGroups(bundle, 'nitro')
}

function immutableCards() {
  let built
  return {
    'prerender:generate'(_route, instance) {
      built = instance
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
  const refreshPlugins = () => config({ ...options, refreshPlugins }).plugins
  const server = await createServer(config({ ...options, refreshPlugins }))
  try {
    await server.listen()
    return server
  } catch (error) {
    await server.close()
    throw error
  }
}

/** Build client and server for `preset` (node by default; bun, deno_server…), into `.output/` unless the preset moves it. */
export async function build(options) {
  const production = { date: buildDate(process.env.SOURCE_DATE_EPOCH) }
  process.env.KERF_START_DIR ??= startDir // for the share cards a build draws (og/native.mjs)
  const building = process.env.KERF_BUILD
  process.env.KERF_BUILD ??= '1'
  try {
    const builder = await createBuilder(config({ ...options, command: 'build', production }))
    await builder.buildApp()
    const { dir, publicDir } = production.output
    await finalizeBuild(production.output, production.date)
    return { output: publicDir.startsWith(dir) ? dir : publicDir }
  } finally {
    if (building === undefined) delete process.env.KERF_BUILD
  }
}
