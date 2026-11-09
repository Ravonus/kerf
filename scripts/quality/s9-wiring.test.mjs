import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import plugin from './lint-plugin.mjs'
import { inventoryStep, splitCommentWarnings } from './s9-warnings.mjs'

const run = (cmd, args) =>
  new Promise((resolve) => {
    const child = spawn(cmd, args)
    let out = ''
    child.stdout.on('data', (data) => {
      out += data
    })
    child.stderr.on('data', (data) => {
      out += data
    })
    child.on('error', (error) => resolve({ code: 1, out: String(error) }))
    child.on('close', (code) => resolve({ code, out }))
  })

void test('inventory prints every warning and fails on child errors', async () => {
  const output = []
  const good = inventoryStep(
    'structure',
    () => run(process.execPath, ['-e', "console.log('bad one\\nbad two')"]),
    (text) => output.push(text),
  )
  assert.deepEqual(await good.run(), { problems: [] })
  assert.match(output[0], /bad one\nbad two/)
  const bad = inventoryStep('structure', () =>
    run(process.execPath, ['-e', "console.error('broken'); process.exit(7)"]),
  )
  assert.match((await bad.run()).problems[0], /exited 7: broken/)
})

void test('comment rule reports analysis warnings and preserves other lint errors', () => {
  const reports = []
  const rule = plugin.rules['comment-budget'].create({
    filename: 'source.ts',
    sourceCode: { text: '// Sprint 9\nconst a = 1' },
    report: (report) => reports.push(report),
  })
  rule.Program({})
  assert.ok(reports.some(({ message }) => message.includes('narration')))
  const warning = {
    code: 'weft(comment-budget)',
    severity: 'warning',
    filename: 'x',
    message: 'bad',
  }
  const error = { ...warning, severity: 'error' }
  assert.deepEqual(splitCommentWarnings([warning, error]), { warnings: ['x:0 bad'], rest: [error] })
})

void test('comment analysis loads the CLI parser ahead of an incompatible root package', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, symlinkSync, rmSync } =
    await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join, dirname } = await import('node:path')
  const { createRequire } = await import('node:module')
  const root = mkdtempSync(join(tmpdir(), 'weft-parser-'))
  try {
    const cli = join(root, 'packages/cli')
    const quality = join(root, 'scripts/quality')
    mkdirSync(join(cli, 'node_modules'), { recursive: true })
    mkdirSync(join(root, 'node_modules/typescript'), { recursive: true })
    mkdirSync(quality, { recursive: true })
    mkdirSync(join(root, 'scripts/lib'), { recursive: true })
    writeFileSync(join(cli, 'package.json'), '{}')
    writeFileSync(join(root, 'node_modules/typescript/index.js'), 'module.exports = {}')
    writeFileSync(
      join(root, 'scripts/lib/helpers.mjs'),
      `export const repoRoot = ${JSON.stringify(root)}`,
    )
    copyFileSync(
      new URL('./comment-budget.mjs', import.meta.url),
      join(quality, 'comment-budget.mjs'),
    )
    const require = createRequire(new URL('../../packages/cli/package.json', import.meta.url))
    symlinkSync(
      dirname(require.resolve('typescript/package.json')),
      join(cli, 'node_modules/typescript'),
      'dir',
    )
    const child = await run(process.execPath, [
      '--input-type=module',
      '-e',
      `import { analyzeComments } from ${JSON.stringify(new URL(`file://${join(quality, 'comment-budget.mjs')}`).href)}; if (!analyzeComments('// Sprint 9\\nconst x = 1').warnings.length) process.exit(1)`,
    ])
    assert.equal(child.code, 0, child.out)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

void test('category inventory prints warnings and propagates failure', async () => {
  const output = []
  const good = inventoryStep(
    'category-limits',
    async (cmd, args) => {
      assert.equal(cmd, process.execPath)
      assert.deepEqual(args, ['scripts/quality/category-limits.mjs'])
      return { code: 0, out: 'one\ntwo\n' }
    },
    (text) => output.push(text),
  )
  assert.deepEqual(await good.run(), { problems: [] })
  assert.match(output[0], /one\ntwo/)
  const bad = inventoryStep('category-limits', async () => ({ code: 9, out: 'parser failed' }))
  assert.match((await bad.run()).problems[0], /exited 9: parser failed/)
})
