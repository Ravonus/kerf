import { matchingRouteAssets, selectRouteAssets } from '../src/asset-receipt.mjs'
import type { AssetReceipt, RouteAssetCosts, RoutePayload } from '../src/router'
import type { ClientRoutes, RouteShape } from '../src/run'

const receipt: AssetReceipt = {
  build: 'build-a',
  version: 1,
  scope: 'vite-static-closure',
  files: { 'route.js': { bytes: 12, kind: 'js' } },
  routes: { '/': { files: ['route.js'], bytes: 12 } },
  eager: null,
}

const selected: RouteAssetCosts | null = selectRouteAssets(receipt, 'build-a', ['/'])
export const bootCosts: RouteAssetCosts | null = matchingRouteAssets(
  selected ?? undefined, 'build-a',
)
export const payload: RoutePayload = {
  m: [{ id: '/', params: {} }],
  p: '/',
  s: 200,
  ...(selected && { a: selected }),
}
export const shapes: Record<string, RouteShape> = {
  '/': { kind: 'override', component: () => null, css: null, cssText: [],
    cssStatus: 'partial', bytes: null },
  '/disabled': { kind: 'disabled', css: null, bytes: null },
  '/unknown': { kind: 'unavailable', reason: 'missing-shape', css: null, bytes: null },
}
export const routes: ClientRoutes = { build: 'build-a', table: [], load: {}, shapes }
