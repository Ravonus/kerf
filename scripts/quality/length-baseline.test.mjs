import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compareLengths } from './length-baseline.mjs'
import { packageProblems } from './package-folders.mjs'
import { clippyProblems, lintProblems } from './length-diagnostics.mjs'
import { fileLimit, lineCount } from './length-metrics.mjs'
import { rustFindings } from './length-rust.mjs'
import { checkLengths, collect, gitBaseline, root, toBaseline } from './lengths.mjs'

const value = (lines, tokens = lines * 4) => ({ lines, tokens })
const entry = (id, lines, tokens) => ({ [id]: value(lines, tokens) })
const file = 'file:src/a.ts',
  fn = 'function:src/a.ts:run'

function temp(run) {
  const dir = mkdtempSync(join(tmpdir(), 'kerf-length-test-'))
  try {
    return run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

await test('new and worsened findings fail, while removal and shrinkage pass', () => {
  const base = entry(file, 500)
  assert.match(
    compareLengths({ ...entry(file, 501), ...entry(fn, 81) }, base, base).join('\n'),
    /length offender increased/,
  )
  assert.match(
    compareLengths({ ...entry(file, 501), ...entry(fn, 81) }, base, base).join('\n'),
    /new length offender/,
  )
  assert.deepEqual(compareLengths(entry(file, 450), entry(file, 480), base), [])
  assert.deepEqual(compareLengths({}, {}, base), [])
  assert.match(compareLengths(entry(file, 450), {}, base).join('\n'), /new length offender/)
})

// In a scratch tree, not the repository: the other check steps run at the same time and would see the folder.
await test('package folder check rejects a mismatched name', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'kerf-folder-check-'))
  try {
    mkdirSync(join(scratch, 'packages/right'), { recursive: true })
    const manifest = join(scratch, 'packages/right/package.json')
    writeFileSync(manifest, JSON.stringify({ name: '@kerf-js/right' }))
    assert.deepEqual(packageProblems(scratch, ['packages/right']), [])
    writeFileSync(manifest, JSON.stringify({ name: '@kerf-js/wrong' }))
    assert.deepEqual(packageProblems(scratch, ['packages/right']), [
      'packages/right: package name @kerf-js/wrong requires packages/wrong',
    ])
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
})

await test('renamed offenders retain their trusted limit', () => {
  const old = ['file:packages', 'kerf', 'src/a.ts'].join('/')
  const renamed = 'file:packages/core/src/a.ts'
  assert.deepEqual(compareLengths(entry(renamed, 500), entry(renamed, 500), entry(old, 500)), [])
  assert.match(
    compareLengths(entry(renamed, 501), entry(renamed, 501), entry(old, 500)).join('\n'),
    /baseline increases/,
  )
  for (const [from, to] of [
    ['apps/a.ts', 'examples/a.ts'],
    ['compare/a.ts', 'benchmarks/compare/a.ts'],
    ['speed/a.ts', 'benchmarks/speed/a.ts'],
    ['phase3-exit.e2e.mjs', 'evals/gates/phase3-exit.e2e.mjs'],
  ]) {
    const previous = `file:evals/${from}`,
      current = `file:${to}`
    assert.deepEqual(
      compareLengths(entry(current, 500), entry(current, 500), entry(previous, 500)),
      [],
    )
    assert.match(
      compareLengths(entry(current, 501), entry(current, 501), entry(previous, 500)).join('\n'),
      /baseline increases/,
    )
  }
})

await test('enlarged or added baseline entries cannot authorize growth', () => {
  const base = entry(file, 500)
  assert.match(
    compareLengths(entry(file, 501), entry(file, 501), base).join('\n'),
    /baseline increases/,
  )
  assert.match(compareLengths(entry(fn, 81), entry(fn, 81), base).join('\n'), /baseline adds/)
  assert.match(compareLengths(entry(file, 500, 2001), base, base).join('\n'), /tokens/)
  for (const invalid of [0, -1, 1.5, '90', null])
    assert.throws(() => compareLengths({}, { [file]: invalid }, {}))
})

await test('the trusted baseline comes from Git even after the branch commits an enlargement', () =>
  temp((dir) => {
    const git = (...args) =>
      execFileSync('git', args, { cwd: dir, stdio: 'pipe', encoding: 'utf8' }).trim()
    git('init', '-b', 'main')
    git('config', 'user.name', 'Length Test')
    git('config', 'user.email', 'length@example.invalid')
    mkdirSync(join(dir, 'scripts/quality'), { recursive: true })
    const path = join(dir, 'scripts/quality/length-baseline.json')
    writeFileSync(path, JSON.stringify(entry(file, 500)))
    git('add', '.')
    git('commit', '-m', 'Initial baseline')
    git('checkout', '-b', 'change')
    writeFileSync(path, JSON.stringify(entry(file, 550)))
    git('add', '.')
    git('commit', '-m', 'Enlarge baseline')
    const trusted = gitBaseline(dir, 'main')
    assert.equal(trusted.ref, git('rev-parse', 'main'))
    assert.match(
      compareLengths(entry(file, 550), JSON.parse(readFileSync(path)), trusted.baseline).join('\n'),
      /baseline increases/,
    )
    git('branch', '-f', 'main', 'HEAD')
    assert.equal(gitBaseline(dir, 'main').baseline[file].lines, 500)
    writeFileSync(path, JSON.stringify(entry(file, 480)))
    git('add', '.')
    git('commit', '-m', 'Shrink baseline')
    writeFileSync(path, JSON.stringify(entry(file, 490)))
    git('add', '.')
    git('commit', '-m', 'Restore a larger limit')
    git('branch', '-f', 'main', 'HEAD')
    assert.equal(gitBaseline(dir, 'main').baseline[file].lines, 480)
  }))

await test('the collector and Git gate reject a real enlarged offender and baseline', () =>
  temp((dir) => {
    const git = (...args) =>
      execFileSync('git', args, { cwd: dir, stdio: 'pipe', encoding: 'utf8' }).trim()
    git('init', '-b', 'main')
    git('config', 'user.name', 'Length Test')
    git('config', 'user.email', 'length@example.invalid')
    mkdirSync(join(dir, 'scripts/quality'), { recursive: true })
    mkdirSync(join(dir, 'src'))
    for (const name of ['length-config.json', 'length-metrics.mjs', 'length-plugin.mjs'])
      copyFileSync(join(root, 'scripts/quality', name), join(dir, 'scripts/quality', name))
    symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'), 'dir')
    writeFileSync(join(dir, '.gitignore'), 'node_modules\n')
    const source = join(dir, 'src/long.mjs'),
      baseline = join(dir, 'scripts/quality/length-baseline.json')
    const writeSource = (n) =>
      writeFileSync(source, `export function long() {\n${'  work();\n'.repeat(n)}}\n`)
    const writeBaseline = () => writeFileSync(baseline, JSON.stringify(toBaseline(collect(dir))))
    writeSource(85)
    writeBaseline()
    git('add', '.')
    git('commit', '-m', 'Initial baseline')
    git('checkout', '-b', 'change')
    assert.deepEqual(checkLengths(dir, 'main').problems, [])
    const newcomer = join(dir, 'src/new.mjs')
    writeFileSync(newcomer, `export function added() {\n${'  work();\n'.repeat(81)}}\n`)
    assert.match(checkLengths(dir, 'main').problems.join('\n'), /new length offender/)
    unlinkSync(newcomer)
    writeFileSync(newcomer, ['// oxlint', '-disable-next-line -- reason\n', 'work();\n'].join(''))
    assert.throws(() => collect(dir), /can hide length findings/)
    unlinkSync(newcomer)
    writeSource(86)
    assert.match(checkLengths(dir, 'main').problems.join('\n'), /length offender increased/)
    writeBaseline()
    git('add', '.')
    git('commit', '-m', 'Enlarge offender and baseline')
    assert.match(checkLengths(dir, 'main').problems.join('\n'), /baseline increases/)
    writeSource(81)
    writeBaseline()
    assert.deepEqual(checkLengths(dir, 'main').problems, [])
  }))

await test('test, generated and vendored files get the 800-line limit', () => {
  assert.equal(lineCount('one\n\ntwo\n'), 3)
  for (const path of ['src/a.ts', 'src/main.rs']) assert.equal(fileLimit(path), 400)
  for (const path of [
    'src/a.test.ts',
    'tests/a.rs',
    'test-a.mjs',
    'src/gen/a.ts',
    'vendor/a.js',
    'src/a.generated.ts',
    'packages/core/node/css.mjs',
    'evals/results/snapshot.js',
  ])
    assert.equal(fileLimit(path), 800)
  const source = Array.from({ length: 500 }, () => 'let a = 1;').join('\n')
  assert.equal(rustFindings('src/a.rs', source).filter((f) => f.kind === 'file').length, 1)
  assert.equal(rustFindings('tests/a.rs', source).filter((f) => f.kind === 'file').length, 0)
  assert.equal(
    rustFindings('tests/a.rs', `${source}\n${source}`).filter((f) => f.kind === 'file').length,
    1,
  )
})

await test('Rust function identities survive line shifts and ignore braces in comments and strings', () => {
  const body = Array.from({ length: 85 }, () => '    value += 1;').join('\n')
  const text = `fn longer() {\n let s = r#"}"#; let c = '\\u{7b}'; // {\n /* { /* } */ } */\n${body}\n finish()\n}\n`
  const first = rustFindings('src/a.rs', text).find((f) => f.kind === 'function')
  const shifted = rustFindings('src/a.rs', `\n\n${text}`).find((f) => f.kind === 'function')
  assert.equal(first.id, 'function:src/a.rs:longer')
  assert.equal(first.id, shifted.id)
  assert.equal(first.count, shifted.count)
  assert.equal(first.tokens, shifted.tokens)
  const terminated = rustFindings('src/a.rs', text.replace('finish()', 'finish();')).find(
    (f) => f.kind === 'function',
  )
  assert.equal(terminated.tokens, first.tokens)
  assert.equal(terminated.count, first.count)
})

await test('Oxlint collector measures file limits, stable names and whitespace-independent syntax size', () =>
  temp((dir) => {
    const filePath = join(dir, 'sample.mjs')
    const collectJs = (source, path = filePath) => {
      writeFileSync(path, source)
      const result = spawnSync(
        join(root, 'node_modules/.bin/oxlint'),
        ['-c', 'scripts/quality/length-config.json', '--format', 'json', '--no-ignore', path],
        { cwd: root, encoding: 'utf8' },
      )
      assert.ok([0, 1].includes(result.status), result.stderr)
      return JSON.parse(result.stdout).diagnostics.map((d) => JSON.parse(d.message))
    }
    const statements = Array.from({ length: 200 }, () => 'run();')
    const loose = collectJs(`class Box {\n action() {\n${statements.join('\n')}\n }\n}`)
    const packed = collectJs(
      `\nclass Box {\n action() {\n${Array.from({ length: 100 }, (_, i) => statements.slice(i * 2, i * 2 + 2).join(' ')).join('\n')}\n }\n}`,
    )
    const a = loose.find((f) => f.kind === 'function'),
      b = packed.find((f) => f.kind === 'function')
    assert.equal(a.id, 'Box.action')
    assert.equal(a.id, b.id)
    assert.notEqual(a.count, b.count)
    assert.equal(a.tokens, b.tokens)
    assert.equal(
      collectJs(Array.from({ length: 401 }, () => 'run();').join('\n')).filter(
        (f) => f.kind === 'file',
      ).length,
      1,
    )
    mkdirSync(join(dir, 'gen'))
    const generated = join(dir, 'gen', 'sample.mjs'),
      testPath = join(dir, 'sample.test.mjs')
    const lines = (n) => Array.from({ length: n }, () => 'run();').join('\n')
    assert.equal(collectJs(lines(500), generated).filter((f) => f.kind === 'file').length, 0)
    assert.equal(collectJs(lines(500), testPath).filter((f) => f.kind === 'file').length, 0)
    assert.equal(collectJs(lines(801), generated).filter((f) => f.kind === 'file').length, 1)
    assert.ok(
      collectJs(`function generated() {\n${lines(81)}\n}`, generated).some(
        (f) => f.kind === 'function',
      ),
    )
  }))

await test('only matched length diagnostics are routed through the baseline', () => {
  const finding = { id: fn, kind: 'function', start: 10, end: 100 }
  const lengths = { findings: [finding], problems: [] }
  const diag = (code, line) => ({
    filename: 'src/a.ts',
    code,
    message: 'diagnostic',
    labels: [{ span: { line } }],
  })
  assert.deepEqual(
    lintProblems(
      {
        diagnostics: [
          diag('eslint(max-lines-per-function)', 10),
          diag('eslint(no-undef)', 10),
          diag('eslint(max-lines-per-function)', 120),
        ],
      },
      lengths,
    ),
    [
      'src/a.ts:10 eslint(no-undef) diagnostic',
      'src/a.ts:120 eslint(max-lines-per-function) diagnostic',
    ],
  )
  const message = (code) =>
    JSON.stringify({
      reason: 'compiler-message',
      message: {
        level: code === 'clippy::too_many_lines' ? 'warning' : 'error',
        code: { code },
        message: code,
        spans: [{ is_primary: true, file_name: 'a.ts', line_start: 10 }],
      },
    })
  assert.deepEqual(
    clippyProblems('src', { code: 0, out: message('clippy::too_many_lines') }, lengths),
    [],
  )
  assert.match(
    clippyProblems('src', { code: 101, out: message('clippy::too_many_lines') }, lengths).join(
      '\n',
    ),
    /cargo clippy failed/,
  )
  assert.deepEqual(
    clippyProblems(
      'src',
      { code: 101, out: `${message('clippy::too_many_lines')}\n${message('clippy::other')}` },
      lengths,
    ),
    ['src: clippy::other'],
  )
  const nested = JSON.stringify({
    reason: 'compiler-message',
    message: {
      level: 'error',
      code: { code: 'clippy::too_many_lines' },
      message: 'nested function',
      spans: [{ is_primary: true, file_name: 'a.ts', line_start: 50, line_end: 50 }],
    },
  })
  assert.deepEqual(clippyProblems('src', { code: 101, out: nested }, lengths), [
    'src: nested function',
  ])
  assert.match(
    clippyProblems('src', { code: 101, out: 'error: failed to fetch dependency' }, lengths).join(
      '\n',
    ),
    /failed to fetch/,
  )
})
