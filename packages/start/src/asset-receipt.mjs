/**
 * Select only matched levels and union their emitted files for this build.
 * @param {import('./router').AssetReceipt | null | undefined} receipt
 * @param {string | undefined} build
 * @param {string[]} ids
 * @returns {import('./router').RouteAssetCosts | null}
 */
export function selectRouteAssets(receipt, build, ids) {
  if (!build || !receipt || receipt.build !== build || receipt.version !== 1 ||
      receipt.scope !== 'vite-static-closure' || !receipt.routes || !receipt.files || !ids.length)
    return null
  const levels = ids.map((id) => ({ id, entry: Object.hasOwn(receipt.routes, id)
    ? receipt.routes[id] : null }))
  const union = (entries) => {
    const names = new Set()
    for (const entry of entries) {
      if (!entry || !Array.isArray(entry.files) || typeof entry.bytes !== 'number' ||
          !Number.isSafeInteger(entry.bytes) ||
          entry.bytes < 0) return null
      for (const file of entry.files) names.add(file)
    }
    let total = 0
    for (const file of names) {
      const bytes = Object.hasOwn(receipt.files, file) ? receipt.files[file]?.bytes : null
      if (typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes < 0) return null
      total += bytes
      if (!Number.isSafeInteger(total)) return null
    }
    return total
  }
  return {
    build,
    scope: receipt.scope,
    levels: levels.map(({ id, entry }) => ({ id, bytes: union([entry]) })),
    routeBytes: union(levels.map(({ entry }) => entry)),
    eagerBytes: union([receipt.eager]),
    combinedBytes: union([...levels.map(({ entry }) => entry), receipt.eager]),
  }
}

/** @param {import('./router').RouteAssetCosts | undefined} costs
 * @param {string | null | undefined} build
 * @returns {import('./router').RouteAssetCosts | null} */
export function matchingRouteAssets(costs, build) {
  return costs?.build && costs.build === build ? costs : null
}
