import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  HistoryRepository,
  canonicalPath,
  compilerInputs,
  inputGroup,
  requireArtifacts,
  sourceDelta,
  stampCompilerFiles,
} from './measure/history-source.mjs'
import {
  STACKS,
  ancestryEdges,
  archivedRecords,
  firstParentEdges,
  receiptIntervals,
  requireSix,
  sourceReceipt,
  stackVector,
  vectorDelta,
} from './measure/history-records.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const repo = new HistoryRepository(root)
const complete = () => Object.fromEntries(STACKS.map((name) => [name, { js: 100, css: 10 }]))

test('six-stack coverage equals Git, and missing or invalid bytes cannot pass', (t) => {
  const tracked = repo
    .git(['ls-files', '--', 'benchmarks/compare/*/stack.json'])
    .split('\n')
    .filter((path) => /^benchmarks\/compare\/[^/]+\/stack.json$/.test(path))
    .map((path) => path.split('/')[2])
    .sort()
  assert.deepEqual([...STACKS].sort(), tracked)
  t.diagnostic(`Dashboard coverage: ${STACKS.length}/${tracked.length} tracked stacks`)
  const values = complete()
  values['react-mui'].css = 0
  requireSix(stackVector(values))
  delete values['kerf-plain']
  const incomplete = stackVector(values)
  assert.equal(incomplete['kerf-plain'], null)
  assert.throws(() => requireSix(incomplete), /kerf-plain/)
  values['kerf-plain'] = { js: -1, css: 0 }
  assert.throws(() => stackVector(values), /Invalid archived bytes/)
})

test('missing source objects remain visible, and conflicting clean receipts fail', () => {
  const rows = ['known', 'missing'].map((commit) => ({ commit, dirty: false, stacks: complete() }))
  const fake = {
    text: () => rows.map((row) => JSON.stringify(row)).join('\n'),
    resolve(ref) {
      if (ref === 'known') return ref
      throw Object.assign(new Error('missing object'), {
        status: 128,
        stderr: 'Needed a single revision',
      })
    },
    ancestor: () => true,
  }
  const records = archivedRecords(fake, 'container', 'target')
  assert.equal(records.length, 2)
  assert.equal(records[1].source, null)
  assert.match(records[1].sourceError, /Needed a single revision/)
  assert.equal(records[1].ancestorOfTarget, false)
  const other = {
    ...records[0],
    vector: stackVector({ ...complete(), 'kerf-veneer': { js: 101, css: 10 } }),
  }
  assert.throws(() => sourceReceipt([records[0], other], 'known'), /Conflicting/)
})

test('ancestry bridges preserve the merge parent rather than inventing a linear history', () => {
  const graph = {
    base: [],
    baseline: ['base'],
    side: ['base'],
    merge: ['side', 'baseline'],
    tip: ['merge'],
  }
  const fake = {
    parents: (ref) => graph[ref],
    git: (args) => (args.includes('--ancestry-path') ? '' : 'side\nmerge\ntip'),
    ancestor(from, to) {
      return from === to || graph[to].some((parent) => this.ancestor(from, parent))
    },
  }
  assert.deepEqual(ancestryEdges(fake, 'baseline', 'tip'), [
    { commit: 'merge', parent: 'baseline', parentNumber: 2 },
    { commit: 'tip', parent: 'merge', parentNumber: 1 },
  ])
  assert.throws(() => ancestryEdges(fake, 'tip', 'baseline'), /not an ancestor/)
  assert.deepEqual(firstParentEdges(fake, 'baseline', 'tip'), [
    { commit: 'merge', parent: 'side', parentNumber: 1, baselineIntroduced: true },
    { commit: 'tip', parent: 'merge', parentNumber: 1, baselineIntroduced: false },
  ])
})

test('dirty intervals retain all candidate changes and never fill missing stacks with zero', () => {
  const before = stackVector(complete()),
    after = stackVector({ ...complete(), 'kerf-veneer': { js: 110, css: 12 } })
  const rows = [
    { source: 'a', dirty: false, line: 1, vector: before, sixStacks: true },
    { source: 'b', dirty: true, line: 2, vector: after, sixStacks: true },
    { source: 'c', dirty: false, line: 3, vector: after, sixStacks: true },
  ]
  const edges = ['b', 'c'].map((commit) => ({ commit, delta: { files: [commit] } }))
  const [interval] = receiptIntervals(rows, ['a', 'b', 'c'], edges)
  assert.deepEqual(interval.inputChanges, ['b', 'c'])
  assert.deepEqual(interval.archivedDelta['kerf-veneer'], { js: 10, css: 2 })
  assert.equal(vectorDelta({ ...before, 'kerf-plain': null }, after)['kerf-plain'], null)
})

test('package/layout renames retain identity and unrelated design manifests stay out', () => {
  assert.equal(canonicalPath('packages/ui-core/src/a.ts'), 'packages/veneer-core/src/a.ts')
  assert.equal(canonicalPath('packages/kerf/src/a.ts'), 'packages/core/src/a.ts')
  assert.equal(inputGroup('benchmarks/compare/design/react-mui/package.json'), null)
  const fake = {
    inputs: (ref) =>
      new Map([
        [
          'same',
          {
            group: 'veneer-core-js',
            bytes: 12,
            files: [
              {
                path: ref === 'a' ? 'packages/ui-core/src/a.ts' : 'packages/veneer-core/src/a.ts',
                object: 'same',
                bytes: 12,
              },
            ],
          },
        ],
      ]),
  }
  assert.equal(sourceDelta(fake, 'a', 'b').totals['veneer-core-js'], 0)
})

test('Git compiler inputs match the independent native stamp and cover every tracked input', (t) => {
  const info = compilerInputs(repo, repo.resolve('HEAD'))
  const { sourceStamp } = createRequire(import.meta.url)(
    '../../packages/core/scripts/native-stamp.cjs',
  )
  assert.equal(info.stamp, sourceStamp())
  const tracked = repo
    .git(['ls-files', '--', 'crates/kerf-compiler'])
    .split('\n')
    .filter((path) =>
      /^crates\/kerf-compiler\/(src\/|Cargo\.(toml|lock)$|build.rs$|rust-toolchain.toml$)/.test(
        path,
      ),
    )
  assert.equal(info.files.length, tracked.length)
  assert.deepEqual(
    info.files.map((file) => `crates/kerf-compiler/${file.path}`).sort(),
    tracked.sort(),
  )
  t.diagnostic(`Compiler coverage: ${info.files.length}/${tracked.length} tracked inputs`)
  const files = info.files.map((file) => ({ path: file.path, data: repo.blob(file.object) }))
  const changed = files.map((file) =>
    file.path === 'src/lib.rs'
      ? { ...file, data: Buffer.concat([file.data, Buffer.from('\n// changed input\n')]) }
      : file,
  )
  assert.notEqual(stampCompilerFiles(changed), info.stamp)
  assert.throws(
    () => stampCompilerFiles(files.filter((file) => file.path !== 'src/lib.rs')),
    /Missing compiler source/,
  )
})

test('artifact preflight rejects an existing binary from a different source stamp', () => {
  const expected = [{ ref: 'historical', stamp: 'old' }]
  assert.throws(
    () => requireArtifacts(expected, [{ path: 'compiler.node', stamp: 'new' }]),
    /historical:old.*available: new/,
  )
  assert.doesNotThrow(() => requireArtifacts(expected, [{ path: 'compiler.node', stamp: 'old' }]))
})
