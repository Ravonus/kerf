import { test } from 'node:test'
import assert from 'node:assert/strict'
import { measure, overrides, overrideDrift } from './category-limits.mjs'

void test('category limits report bad file, function and parameter counts', () => {
  const text = `function work(a,b,c,d,e,f) {\n${'const x = 1;\n'.repeat(150)}return a\n}`
  const result = measure('app/src/utils/x.ts', text)
  assert.deepEqual(
    result.findings.map((f) => f.kind),
    ['file', 'function', 'params'],
  )
  assert.deepEqual(measure('app/src/utils/x.ts', 'function work(a) { return a }').findings, [])
})

void test('null limits and first match are preserved', () => {
  const result = measure('app/types/x.ts', 'function f(a,b,c,d,e) { return a }')
  assert.equal(result.category, 'types')
  assert.deepEqual(result.findings, [])
  assert.equal(measure('app/src/types.ts', '').category, 'module')
})

void test('override drift detects changes and keeps first-match disjoint paths', () => {
  const files = [{ path: 'app/src/utils/x.ts' }, { path: 'app/src/X.tsx' }]
  const result = overrides(files)
  assert.equal(overrideDrift(result, files), false)
  assert.equal(result[0].rules['max-params'][1].max, 5)
  result[0].rules['max-params'][1].max = 6
  assert.equal(overrideDrift(result, files), true)
})

void test('Rust functions use the category limit and count nested parameter types', () => {
  const body = 'let x = 1;\n'.repeat(45)
  const text = `fn f<T>(a: (i32, i32), b: Vec<Result<i32, T>>, c: [u8; 2], d: i32, e: i32, g: i32) {\n${body}}`
  const result = measure('crates/a/src/utils/foo.rs', text)
  assert.deepEqual(
    result.findings.map((item) => item.kind),
    ['function', 'params'],
  )
  assert.equal(result.findings[1].count, 6)
  assert.deepEqual(measure('crates/a/src/utils/foo.rs', 'fn f(a: (i32, i32)) {}').findings, [])
})

void test('parser diagnostics include their source path', () => {
  assert.ok(measure('app/src/invalid.ts', 'function {').parseErrors > 0)
})

void test('generated overrides match literal glob metacharacters in Oxlint', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join, resolve, dirname } = await import('node:path')
  const { spawnSync } = await import('node:child_process')
  const root = mkdtempSync(join(tmpdir(), 'weft-oxlint-'))
  try {
    const files = [
      'src/utils/[id].ts',
      'src/utils/q?.ts',
      'src/utils/star*.ts',
      'src/utils/ordinary.ts',
      'src/utils/i.ts',
      'src/utils/good.ts',
    ]
    for (const path of files) {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(
        join(root, path),
        path.endsWith('good.ts') ? 'function f(a) {}' : 'function f(a,b,c,d,e,f) {}',
      )
    }
    const generated = overrides([0, 1, 2, 3, 5].map((index) => ({ path: files[index] })))
    writeFileSync(
      join(root, '.oxlintrc.json'),
      JSON.stringify({
        categories: { correctness: 'off', suspicious: 'off' },
        overrides: generated,
      }),
    )
    const local = resolve('node_modules/.bin/oxlint')
    const binary = existsSync(local) ? local : resolve('../../weft/node_modules/.bin/oxlint')
    const result = spawnSync(binary, ['--format', 'json', '--no-ignore', ...files], {
      cwd: root,
      encoding: 'utf8',
    })
    assert.equal(result.status, 0, result.stderr)
    const diagnostics = JSON.parse(result.stdout).diagnostics
    const paths = diagnostics
      .map((item) => item.filename.replaceAll('\\', '/'))
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    assert.deepEqual(
      paths,
      [files[0], files[1], files[2], files[3]].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    )
    assert.ok(diagnostics.every((item) => item.code === 'eslint(max-params)'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

void test('existing Rust collector still reports only long functions', async () => {
  const { rustFindings } = await import('./length-rust.mjs')
  const text = 'fn short(a: i32, b: i32) {}'
  assert.deepEqual(rustFindings('crates/a/src/x.rs', text), [])
  assert.equal(rustFindings('crates/a/src/x.rs', text, { allFunctions: true })[0].params, 2)
})

void test('vendor exclusion applies to inventory and overrides only at its prefix', () => {
  const vendor = 'packages/text/vendor/pretext/src/a.ts'
  const adjacent = 'packages/text/vendor/pretext-other/src/a.ts'
  const bad = `function f(a,b,c,d,e,f) {}`
  assert.equal(measure(vendor, bad).category, null)
  assert.ok(measure(adjacent, bad).findings.length)
  assert.deepEqual(measure(adjacent, 'function f(a) {}').findings, [])
  assert.deepEqual(overrides([{ path: vendor }, { path: adjacent }])[0].files, [adjacent])
})
