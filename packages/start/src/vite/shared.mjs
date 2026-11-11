import { LATE_SHEETS, REFUSED_SHEETS } from '../inline.mjs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** This folder, wherever the package is installed. */
export const here = dirname(fileURLToPath(new URL('../vite.mjs', import.meta.url)))
export const V = {
  routes: 'virtual:kerf/routes',
  app: 'virtual:kerf/app',
  server: 'virtual:kerf/entry-server',
  client: 'virtual:kerf/entry-client',
  fns: 'virtual:kerf/fns',
  context: 'virtual:kerf/context',
  auth: 'virtual:kerf/auth',
  migrations: 'virtual:kerf/migrations',
  media: 'virtual:kerf/media',
  realtime: 'virtual:kerf/realtime',
  cache: 'virtual:kerf/cache',
  cron: 'virtual:kerf/cron',
  email: 'virtual:kerf/email',
  jobs: 'virtual:kerf/jobs',
  extensions: 'virtual:kerf/extensions',
}
export const DEFAULT_FONTS = ['Inter:400,700']
export const SHEET = '/@kerf-sheet/'
export const ASSETS = '?kerf-assets'
export const ISLAND = 'virtual:kerf/island/'
export const PRELOAD =
  'Per page, from the HTML: an island that loads with the page, or a lazy one in about the first 900px, is modulepreloaded (fetched, not run). The rest load when needed. Save-Data: lazy ones are not preloaded, and wait for interaction.'
export const NOT_ASSET = /\.[cm]?[jt]sx?$/
export const INLINE_SHEETS = '__KERF_INLINE_SHEETS__'
export const ROUTE_ASSET_BYTES = '__KERF_ROUTE_ASSET_BYTES__'
// A page's critical CSS with `criticalCss: false` uses the build's own reachability rules.
export const purgeFile = createRequire(join(here, 'vite.mjs'))
  .resolve('@kerf-js/core/node-purge')
  .split('\\')
  .join('/')
export const SHEET_PIECES = '__KERF_SHEET_PIECES__'

/**
 * First in any entry, an app's own too. The page's inline script is the fast path and a CSP can refuse it, so a page
 * that runs at all never stays on its first-paint rules.
 */
export const ENTRY_SHEETS = `${LATE_SHEETS}\n${REFUSED_SHEETS}\n`

/**
 * kerf's own packages from an install, as one chunk of icons and one of what two routes share. Left alone they're a chunk
 * per component: 31 scripts and 18 sheets for an admin page (Solid's: 16 in all), each its own request and its own
 * compression, and 53 KB against 46. An app's own code splits as it likes.
 */
export const KIT_CHUNKS = [
  { name: 'icons', test: /[\\/]node_modules[\\/]@kerf-js[\\/]veneer-icons[\\/]/, priority: 2 },
  { name: 'kit', test: /[\\/]node_modules[\\/]@kerf-js[\\/]/, minShareCount: 2, priority: 1 },
]
