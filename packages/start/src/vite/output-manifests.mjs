// Vite's import lists carry dependency order. Normalize only identities and unordered indexes.
import { resolve, dirname } from 'node:path'

const byKey = ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)

/** Manifest references use the same labels as their generated lookups. */
export function manifestKey(pathFor, key) {
  const virtual = /(?:^|[/\\])\0?((?:virtual:|#nitro\/virtual\/).+)$/.exec(key)
  return virtual ? virtual[1] : pathFor(key)
}

/** Sort Vite's generated index and keep graph edges in their original order. */
export function normalizeViteManifest(json, keyFor) {
  const entries = Object.entries(JSON.parse(json)).map(([key, item]) => {
    if (!Array.isArray(item)) {
      if (item.src) item.src = keyFor(item.src)
      if (item.imports) item.imports = item.imports.map(keyFor)
      if (item.dynamicImports) item.dynamicImports = item.dynamicImports.map(keyFor)
    }
    return [keyFor(key), item]
  })
  if (new Set(entries.map(([key]) => key)).size !== entries.length)
    throw new Error('Duplicate module identity in Vite manifest')
  return JSON.stringify(Object.fromEntries(entries.sort(byKey)), null, 2)
}

/** Run after Vite assembles its optional standard and SSR manifests. */
export function viteManifests(state) {
  return {
    order: 'post',
    handler(_options, bundle) {
      const { manifest, ssrManifest } = this.environment.config.build
      for (const [value, fallback] of [
        [manifest, '.vite/manifest.json'],
        [ssrManifest, '.vite/ssr-manifest.json'],
      ]) {
        if (!value) continue
        const file = bundle[value === true ? fallback : value]
        if (file?.type === 'asset')
          file.source = normalizeViteManifest(file.source.toString(), state.assetKey)
      }
    },
  }
}

function mapSource(pathFor, source, file) {
  return manifestKey(pathFor, source.startsWith('file:') ? source : resolve(dirname(file), source))
}

/** Relabel sources while preserving mappings, names and positional indices. */
export function normalizeCopiedMap(json, pathFor, file) {
  const map = JSON.parse(json)
  map.sources = map.sources.map((source) =>
    source
      ? mapSource(pathFor, source, resolve(dirname(file), map.sourceRoot ?? '', 'map'))
      : source,
  )
  delete map.sourceRoot
  delete map.sourcesContent
  return JSON.stringify(map)
}

/** Rolldown runs this for both external and inline maps. Generated source can contain physical imports. */
export function sourceMapOptions(options, pathFor) {
  if (!options.sourcemap) return
  const configured = options.sourcemapPathTransform
  return {
    ...options,
    sourcemapExcludeSources: true,
    sourcemapPathTransform(source, map) {
      return mapSource(pathFor, configured?.(source, map) ?? source, resolve(options.dir, map))
    },
  }
}
