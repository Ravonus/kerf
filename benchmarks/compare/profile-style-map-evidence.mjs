// Keep complete failed maps outside dist before restoration; caps fail rather than truncate evidence.
import assert from 'node:assert/strict'
import { readFileSync, lstatSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { digest } from './profile-style-maps.mjs'

/** Diagnostics are unaccepted raw maps, not permission to attribute a failed source. */
export function preserveMaps(repo, assets, log) {
  const records = []
  let rawBytes = 0,
    gzipBytes = 0
  for (const [stack, files] of Object.entries(assets)) {
    assert.ok(/^[\w-]+$/.test(stack), 'Unsafe diagnostic stack')
    for (const asset of Object.keys(files).filter((name) => name.endsWith('.js'))) {
      assert.ok(!asset.includes('..') && !asset.startsWith('/'), 'Unsafe diagnostic asset')
      const path = join(repo, 'benchmarks/compare', stack, 'dist', asset + '.map')
      let stat
      try {
        stat = lstatSync(path)
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
        records.push({ stack, asset, missing: true })
        continue
      }
      assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size < 16 * 1024 ** 2)
      const raw = readFileSync(path)
      assert.ok(raw.length < 16 * 1024 ** 2, 'Map grew beyond evidence cap')
      const compressed = gzipSync(raw),
        sha256 = digest(raw)
      rawBytes += raw.length
      gzipBytes += compressed.length
      assert.ok(
        rawBytes < 96 * 1024 ** 2 && gzipBytes < 24 * 1024 ** 2,
        'Map evidence cap exceeded',
      )
      const file = `map-${stack}-${digest(asset)}-${sha256}.json.gz`
      log.append(file, compressed)
      let metadata
      try {
        const map = JSON.parse(raw)
        metadata = {
          version: map.version,
          file: map.file,
          sourceRoot: map.sourceRoot ?? null,
          mappingsSha256: digest(String(map.mappings)),
          sources: map.sources?.map((source, index) => {
            const content = map.sourcesContent?.[index]
            return { source, sha256: typeof content === 'string' ? digest(content) : null }
          }),
        }
      } catch (error) {
        metadata = { parseError: String(error) }
      }
      const record = {
        stack,
        asset,
        file,
        rawBytes: raw.length,
        sha256,
        gzipSha256: digest(compressed),
        metadata,
      }
      records.push(record)
      log.json(file + '.meta.json', record)
    }
  }
  log.json('map-diagnostics.json', { accepted: false, rawBytes, gzipBytes, records })
}
