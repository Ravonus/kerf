import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import plugin from './lint-plugin.mjs'
import { inventoryStep, splitCommentWarnings } from './s9-warnings.mjs'

const run = (cmd, args) => new Promise((resolve) => {
  const child = spawn(cmd, args)
  let out = ''
  child.stdout.on('data', (data) => { out += data })
  child.stderr.on('data', (data) => { out += data })
  child.on('error', (error) => resolve({ code: 1, out: String(error) }))
  child.on('close', (code) => resolve({ code, out }))
})

test('inventory prints every warning and fails on child errors', async () => {
  const output = []
  const good = inventoryStep('structure', () => run(process.execPath, ['-e', "console.log('bad one\\nbad two')"]), (text) => output.push(text))
  assert.deepEqual(await good.run(), { problems: [] })
  assert.match(output[0], /bad one\nbad two/)
  const bad = inventoryStep('structure', () => run(process.execPath, ['-e', "console.error('broken'); process.exit(7)"]))
  assert.match((await bad.run()).problems[0], /exited 7: broken/)
})

test('comment rule reports analysis warnings and preserves other lint errors', () => {
  const reports = []
  const rule = plugin.rules['comment-budget'].create({
    filename: 'source.ts', sourceCode: { text: '// Sprint 9\nconst a = 1' },
    report: (report) => reports.push(report),
  })
  rule.Program({})
  assert.ok(reports.some(({ message }) => message.includes('narration')))
  const warning = { code: 'weft(comment-budget)', severity: 'warning', filename: 'x', message: 'bad' }
  const error = { ...warning, severity: 'error' }
  assert.deepEqual(splitCommentWarnings([warning, error]), { warnings: ['x:0 bad'], rest: [error] })
})
