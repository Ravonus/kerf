import { createServer } from 'vite'
import kerf from '@kerf-js/core/vite'
import kerfStart from '../vite.mjs'

/** Load SSR modules for a one-shot check without touching the live dev server's dependency cache. */
export function inspectionServer(root, site) {
  return createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    plugins: [kerf({ hydratable: true, csp: site?.csp }), kerfStart({ root, site })],
  })
}
