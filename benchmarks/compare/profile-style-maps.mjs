// Resolve original callsites only after every archived dashboard asset matches byte-for-byte.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, lstatSync } from 'node:fs'
import { SourceMap } from 'node:module'
import { basename, dirname, join, relative, resolve } from 'node:path'

export const digest = (data) => createHash('sha256').update(data).digest('hex')

/** A changed or missing JS/CSS asset invalidates every source correlation. */
export function verifyAssets(dist, expected) {
  const files = readdirSync(dist, { recursive: true }).filter((p) => /\.(?:js|css)$/.test(p))
  const wanted = Object.keys(expected).filter((p) => /\.(?:js|css)$/.test(p))
  assert.deepEqual(files.sort(), wanted.sort(), 'Mapped asset coverage mismatch')
  for (const file of files) {
    assert.ok(!lstatSync(join(dist, file)).isSymbolicLink(), 'Symlinked mapped asset')
    const data = readFileSync(join(dist, file))
    assert.equal(data.length, expected[file].bytes, `Mapped asset bytes mismatch: ${file}`)
    assert.equal(digest(data), expected[file].sha256, `Mapped asset hash mismatch: ${file}`)
  }
}

function sourceProof(repo, commit, mapPath, payload) {
  assert.ok(payload.version === 3 && Array.isArray(payload.sources), 'Invalid source map')
  assert.ok(
    Array.isArray(payload.sourcesContent) &&
      payload.sourcesContent.length === payload.sources.length,
    'Missing original source content',
  )
  assert.ok(!payload.sourceRoot, 'Unsupported sourceRoot')
  return payload.sources.map((source, index) => {
    const file = resolve(dirname(mapPath), source),
      path = relative(repo, file)
    const content = payload.sourcesContent[index]
    assert.equal(typeof content, 'string', 'Missing mapped source')
    if (path.includes('node_modules')) return { source, status: 'dependency; not Git attributed' }
    assert.ok(!path.startsWith('../') && !path.startsWith('/'), 'Source outside repository')
    const original = execFileSync('git', ['show', `${commit}:${path}`], { cwd: repo })
    assert.equal(digest(Buffer.from(content)), digest(original), `Mapped source mismatch: ${path}`)
    return { source, path, sha256: digest(original), status: 'Git content verified' }
  })
}

/** Verify the whole six-stack manifest before exposing a mapper for any one stack. */
export function loadMaps(repo, pins) {
  const maps = new Map(),
    proofs = []
  for (const [stack, assets] of Object.entries(pins.assets))
    verifyAssets(join(repo, 'benchmarks/compare', stack, 'dist'), assets)
  for (const [stack, assets] of Object.entries(pins.assets)) {
    for (const asset of Object.keys(assets).filter((p) => p.endsWith('.js'))) {
      const mapPath = join(repo, 'benchmarks/compare', stack, 'dist', asset + '.map')
      const raw = readFileSync(mapPath)
      assert.ok(raw.length < 16 * 1024 ** 2, 'Oversized source map')
      const payload = JSON.parse(raw)
      assert.equal(payload.file, basename(asset), 'Source map generated file mismatch')
      const sources = sourceProof(repo, pins.pins.commit, mapPath, payload)
      maps.set(stack + '/' + asset, { map: new SourceMap(payload), sources })
      proofs.push({ stack, asset, mapSha256: digest(raw), sources })
    }
  }
  return {
    proofs,
    frame(stack, frame) {
      if (!frame.url?.startsWith('http')) return { ...frame, original: null }
      const path = new URL(frame.url).pathname.slice(1),
        entry = maps.get(stack + '/' + path)
      assert.ok(entry, `Unwitnessed frame asset: ${stack}/${path}`)
      const found = entry.map.findEntry(frame.lineNumber, frame.columnNumber)
      const source = entry.sources.find(
        (s) =>
          s.source === found.originalSource ||
          resolve(
            dirname(join(repo, 'benchmarks/compare', stack, 'dist', path + '.map')),
            s.source,
          ) === found.originalSource,
      )
      return {
        ...frame,
        original: source
          ? {
              ...source,
              line: found.originalLine + 1,
              column: found.originalColumn + 1,
              name: found.name ?? null,
            }
          : null,
      }
    },
  }
}
