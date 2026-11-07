import type { AssetReceipt, RouteAssetCosts } from './router'

/** Select only matched levels and union their emitted files for this build. */
export function selectRouteAssets(
  receipt: AssetReceipt | null | undefined,
  build: string | undefined,
  ids: string[],
): RouteAssetCosts | null
/** The costs, if they were measured for this build. */
export function matchingRouteAssets(
  costs: RouteAssetCosts | undefined,
  build: string | null | undefined,
): RouteAssetCosts | null
