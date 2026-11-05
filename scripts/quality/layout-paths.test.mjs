import { repoRoot } from '../lib/helpers.mjs'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import weft from '../../packages/core/vite.mjs'
import { BROWSER, entry } from './boundaries.mjs'

const root = repoRoot

await test('archived and generated paths stay untracked', (t) => {
  const prefixes = [
    'evals/tasks/',
    'evals/tasks-v2/',
    'evals/reference/',
    'evals/reference-v2/',
    'evals/buggy/',
    'evals/buggy-v2/',
    'docs/research/',
    'docs/design/warp/reviews/',
    'docs/design/warp/specimens/',
    'spikes/',
    'site/review/',
    'site/public/reference/',
    'site/public/learn/',
    'packages/warp/test/a11y/gallery/assets/',
    'packages/cli/.vitest/',
  ]
  const removed = new Set([
    'docs/PLAN.md',
    'scripts/rename-scope.mjs',
    'packages/warp-icons/contact-sheet.html',
    'benchmarks/speed/lab.json',
  ])
  const retained = new Set([
    'evals/results/summary.json',
    'evals/results/compare-history.jsonl',
    'evals/results/compare.html',
  ])
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
  const blocked = files.filter(
    (file) =>
      prefixes.some((prefix) => file.startsWith(prefix)) ||
      removed.has(file) ||
      (file.startsWith('evals/results/') && !retained.has(file)),
  )
  assert.equal(blocked.length, 0, `archived or generated files are tracked:\n${blocked.join('\n')}`)
  t.diagnostic(`${files.length} tracked files checked for archived and generated paths`)
})

await test('the layout check rejects a tracked file from every removed category', (t) => {
  const files = [
    'evals/tasks/fixture.md',
    'evals/tasks-v2/fixture.md',
    'evals/reference/fixture.tsx',
    'evals/reference-v2/fixture.tsx',
    'evals/buggy/fixture.tsx',
    'evals/buggy-v2/fixture.tsx',
    'docs/research/fixture.md',
    'docs/design/warp/reviews/fixture.md',
    'docs/design/warp/specimens/fixture.html',
    'spikes/fixture.ts',
    'site/review/fixture.png',
    'site/public/reference/index.html',
    'site/public/learn/index.html',
    'packages/warp/test/a11y/gallery/assets/fixture.js',
    'packages/cli/.vitest/results.json',
    'docs/PLAN.md',
    'scripts/rename-scope.mjs',
    'packages/warp-icons/contact-sheet.html',
    'benchmarks/speed/lab.json',
    'evals/results/sites/first-run-fixture.json',
    'evals/results/old-run.json',
  ]
  const dir = mkdtempSync(join(tmpdir(), 'weft-layout-test-'))
  try {
    const env = { ...process.env, GIT_INDEX_FILE: join(dir, 'index') }
    // The child needs its own test harness rather than this process's context.
    delete env.NODE_TEST_CONTEXT
    const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], {
      cwd: root,
      encoding: 'utf8',
      input: '',
    }).trim()
    execFileSync('git', ['update-index', '--index-info'], {
      cwd: root,
      env,
      input: files.map((file) => `100644 ${blob}\t${file}\n`).join(''),
    })
    const result = spawnSync(
      process.execPath,
      [
        '--test',
        '--test-name-pattern=^archived and generated paths stay untracked$',
        import.meta.filename,
      ],
      { cwd: root, env, encoding: 'utf8' },
    )
    assert.equal(result.status, 1, result.stdout + result.stderr)
    assert.match(result.stdout, /archived or generated files are tracked:/)
    for (const file of files)
      assert.ok(result.stdout.includes(file), `missed tracked path: ${file}`)
    t.diagnostic(`${files.length} prohibited paths rejected with exit ${result.status}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

await test('browser entries name tracked package folders', (t) => {
  const manifests = execFileSync('git', ['ls-files', ':(glob)packages/*/package.json'], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
  const folders = new Set(manifests.map(dirname))
  let entries = 0
  for (const [folder, exports] of Object.entries(BROWSER)) {
    assert.ok(folders.has(`packages/${folder}`), `untracked browser package: ${folder}`)
    for (const name of exports) {
      const file = entry(folder, name)
      assert.ok(file && existsSync(file), `missing browser entry: ${folder}${name}`)
      entries++
    }
  }
  t.diagnostic(
    `${entries} browser entries in ${Object.keys(BROWSER).length}/${manifests.length} tracked packages`,
  )
})

await test('Vite keeps core internals outside app transforms after the folder move', () => {
  const plugins = weft({ off: ['REUSE'] })
  for (const name of ['weft:keyed', 'weft:features', 'weft:interaction']) {
    const plugin = plugins.find((item) => item.name === name)
    const exclude = plugin.transform.filter.id.exclude
    for (const path of [
      '/repo/packages/core/src/index.ts',
      'C:\\repo\\packages\\core\\src\\index.ts',
    ])
      assert.ok(exclude.test(path), `${name} rewrites core internals: ${path}`)
    assert.equal(exclude.test('/repo/app/src/index.ts'), false)
  }
  const flags = plugins.find((item) => item.name === 'weft:flags').transform
  for (const path of [
    '/repo/packages/core/src/flags.ts',
    'C:\\repo\\packages\\core\\src\\flags.ts',
  ])
    assert.ok(flags.filter.id.test(path), `speed flags miss the moved source: ${path}`)
  assert.match(flags.handler('export const REUSE = true').code, /REUSE = false/)
})
