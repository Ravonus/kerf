import { LATE_SHEETS, REFUSED_SHEETS } from '../inline.mjs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** This folder, wherever the package is installed. */
export const here = dirname(fileURLToPath(new URL('../vite.mjs', import.meta.url)))
export const V = {
  routes: 'virtual:weft/routes',
  app: 'virtual:weft/app',
  server: 'virtual:weft/entry-server',
  client: 'virtual:weft/entry-client',
  fns: 'virtual:weft/fns',
  context: 'virtual:weft/context',
  auth: 'virtual:weft/auth',
  migrations: 'virtual:weft/migrations',
  media: 'virtual:weft/media',
  realtime: 'virtual:weft/realtime',
  cache: 'virtual:weft/cache',
  cron: 'virtual:weft/cron',
  email: 'virtual:weft/email',
  jobs: 'virtual:weft/jobs',
  extensions: 'virtual:weft/extensions',
}
export const DEFAULT_FONTS = ['Inter:400,700']
export const SHEET = '/@weft-sheet/'
export const ASSETS = '?weft-assets'
export const ISLAND = 'virtual:weft/island/'
export const PRELOAD =
  'Per page, from the HTML: an island that loads with the page, or a lazy one in about the first 900px, is modulepreloaded (fetched, not run). The rest load when needed. Save-Data: lazy ones are not preloaded, and wait for interaction.'
export const NOT_ASSET = /\.[cm]?[jt]sx?$/
export const INLINE_SHEETS = '__WEFT_INLINE_SHEETS__'
export const ROUTE_ASSET_BYTES = '__WEFT_ROUTE_ASSET_BYTES__'
// A page's critical CSS with `criticalCss: false` uses the build's own reachability rules.
export const purgeFile = createRequire(join(here, 'vite.mjs'))
  .resolve('@weft-js/core/node-purge')
  .split('\\')
  .join('/')
export const SHEET_PIECES = '__WEFT_SHEET_PIECES__'

/**
 * First in any entry, an app's own too. The page's inline script is the fast path and a CSP can refuse it, so a page
 * that runs at all never stays on its first-paint rules.
 */
export const ENTRY_SHEETS = `${LATE_SHEETS}\n${REFUSED_SHEETS}\n`

/**
 * weft's own packages from an install, as one chunk of icons and one of what two routes share. Left alone they're a chunk
 * per component: 31 scripts and 18 sheets for an admin page (Solid's: 16 in all), each its own request and its own
 * compression, and 53 KB against 46. An app's own code splits as it likes.
 */
export const KIT_CHUNKS = [
  { name: 'icons', test: /[\\/]node_modules[\\/]@weft-js[\\/]warp-icons[\\/]/, priority: 2 },
  { name: 'kit', test: /[\\/]node_modules[\\/]@weft-js[\\/]/, minShareCount: 2, priority: 1 },
]
