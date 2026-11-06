// Keep original pins immutable while comparing a newly reconstructed install to its frozen inputs.
import assert from 'node:assert/strict'
import { isDeepStrictEqual } from 'node:util'
import { relative } from 'node:path'

/** Only explicit reconstruction permits regenerated install metadata or different text output. */
export function compareEnvironment(actual, original, reconstructed = false) {
  for (const key of ['commit', 'tree', 'node', 'pnpm', 'compiler'])
    assert.deepEqual(actual[key], original[key], `Archived source/toolchain mismatch: ${key}`)
  assert.deepEqual(Object.keys(actual.files).sort(), Object.keys(original.files).sort())
  const metadata = []
  for (const [file, expected] of Object.entries(original.files)) {
    const observed = actual.files[file],
      equal = observed === expected
    const generated =
      /^(?:benchmarks\/compare\/)?node_modules\/(?:\.modules\.yaml|\.pnpm\/lock\.yaml)$/.test(file)
    if (!generated || !reconstructed) assert.ok(equal, `Archived input mismatch: ${file}`)
    if (generated)
      metadata.push({
        file,
        originalSha256: expected,
        reconstructedSha256: observed,
        equal,
        originalBytesAvailable: false,
      })
  }
  const files = new Set([...Object.keys(original.textDist), ...Object.keys(actual.textDist)])
  const text = [...files].map((file) => ({
    file,
    original: original.textDist[file] ?? null,
    reconstructed: actual.textDist[file] ?? null,
    equal: isDeepStrictEqual(original.textDist[file], actual.textDist[file]),
  }))
  if (!reconstructed)
    assert.ok(
      text.every((row) => row.equal),
      'Archived text output mismatch',
    )
  return {
    mode: reconstructed ? 'explicit reconstruction; not the original install' : 'retained',
    metadata,
    text: { equal: text.every((row) => row.equal), files: text },
    host: { original: original.host, reconstructed: actual.host },
    originMain: { original: original.originMain, reconstructed: actual.originMain },
    originalDependencyContentManifest: null,
    caveat:
      'Original installed content was not archived. Frozen inputs, new graph/content checks and final asset hashes provide separate evidence; no new timing is measured.',
  }
}

/** Preserve edge names, peer-slot paths, optional ancestry and resolved versions without timestamps. */
export function dependencyGraph(projects, repo) {
  assert.ok(Array.isArray(projects) && projects.length > 0, 'Missing dependency graph')
  const entries = new Map()
  const walk = (node, key, optional) => {
    assert.ok(entries.size < 100000, 'Dependency graph exceeds edge cap')
    assert.ok(
      node && typeof node.version === 'string' && typeof node.path === 'string',
      'Malformed dependency graph node',
    )
    assert.ok(!entries.has(key), 'Duplicate dependency graph edge')
    entries.set(key, { key, version: node.version, path: relative(repo, node.path), optional })
    for (const kind of ['dependencies', 'devDependencies', 'optionalDependencies'])
      for (const [name, child] of Object.entries(node[kind] ?? {}))
        walk(child, key + '/' + kind + ':' + name, optional || kind === 'optionalDependencies')
  }
  for (const project of projects) {
    assert.ok(typeof project.path === 'string', 'Missing dependency project path')
    const key = relative(repo, project.path)
    for (const kind of ['dependencies', 'devDependencies', 'optionalDependencies'])
      for (const [name, child] of Object.entries(project[kind] ?? {}))
        walk(child, key + '/' + kind + ':' + name, kind === 'optionalDependencies')
  }
  return [...entries.values()].sort((a, b) => a.key.localeCompare(b.key))
}

/** Every installed edge must match the frozen graph; report absent optional subtrees explicitly. */
export function verifyGraph(installed, locked) {
  assert.ok(installed.length > 0 && locked.length > 0, 'Empty dependency graph')
  const expected = new Map(locked.map((row) => [row.key, row])),
    observed = new Map(installed.map((row) => [row.key, row]))
  for (const row of installed)
    assert.deepEqual(row, expected.get(row.key), `Installed graph differs: ${row.key}`)
  const absentOptional = []
  for (const row of locked)
    if (!observed.has(row.key)) {
      assert.ok(row.optional, `Missing required dependency: ${row.key}`)
      absentOptional.push(row)
    }
  return { installedEdges: installed.length, lockedEdges: locked.length, absentOptional }
}
