import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { mutate, verdict } from '../evidence/T06/large-mutants.mjs'

const task = fileURLToPath(new URL('../tasks/large-live/', import.meta.url))
const mutants = JSON.parse(readFileSync(join(task, 'mutants.json'), 'utf8'))

test('all eight named controls mutate exactly one real source target', () => {
  assert.equal(mutants.length, 8)
  assert.equal(new Set(mutants.map((entry) => entry.name)).size, 8)
  const smoke = readFileSync(join(task, '../../evidence/T06/large-smoke.mjs'), 'utf8')
  for (const entry of mutants) {
    assert.ok(smoke.includes(entry.assertion), `${entry.name}: missing assertion`)
    const source = readFileSync(join(task, 'reference/weft-warp/src', entry.file), 'utf8')
    assert.notEqual(mutate(source, entry), source, entry.name)
    assert.throws(() => mutate(source.replace(entry.find, ''), entry), /mutation target count/)
  }
})

test('only the named semantic assertion counts; setup, timing and surviving controls fail', () => {
  const child = { status: 1, signal: null }
  const failure = [{ name: 'check', ok: false, error: 'assertion:presence' }]
  assert.equal(verdict(child, failure, 'presence'), 'caught')
  assert.equal(verdict(child, failure, 'author-delete'), 'inconclusive')
  assert.equal(
    verdict(child, [{ name: 'check', ok: false, error: 'assertion:presence-other' }], 'presence'),
    'inconclusive',
  )
  assert.equal(
    verdict(child, [{ name: 'check', ok: false, error: 'inconclusive:presence' }], 'presence'),
    'inconclusive',
  )
  assert.equal(
    verdict(
      child,
      [{ name: 'owned listener', ok: false, error: 'assertion:presence' }],
      'presence',
    ),
    'inconclusive',
  )
  assert.equal(verdict({ status: 0 }, [], 'presence'), 'survived')
  assert.equal(verdict({ status: 1, signal: 'SIGTERM' }, failure, 'presence'), 'inconclusive')
  assert.equal(verdict(child, null, 'presence'), 'inconclusive')
})

test('mutant dispatch records eight catches and stops on a build failure', async () => {
  const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const repo = fileURLToPath(new URL('../../..', import.meta.url))
  const { runMutants } = await import('../evidence/T06/large-mutants.mjs')
  for (const breakBuild of [false, true]) {
    const job = mkdtempSync(join(tmpdir(), 'weft-large-mutants-'))
    const app = join(job, 'state/golden/weft-warp/app'),
      receipts = join(job, 'receipts')
    mkdirSync(join(app, 'src'), { recursive: true })
    mkdirSync(receipts)
    writeFileSync(join(app, '.env'), 'BETTER_AUTH_SECRET=fixture-secret\n')
    let index = 0
    const run = (_command, args, options) => {
      if (args.includes('build')) return { status: breakBuild ? 1 : 0, stdout: '', stderr: '' }
      const dir = options.env.WEFT_T06_RECEIPTS
      writeFileSync(
        join(dir, 'runtime-smoke.json'),
        JSON.stringify([
          { name: 'semantic check', ok: false, error: `assertion:${mutants[index++].assertion}` },
        ]),
      )
      return { status: 1, stdout: '', stderr: '' }
    }
    try {
      const args = { app, repo, job, receipts, pnpm: '/fixture', run, ready() {} }
      if (breakBuild) assert.throws(() => runMutants(args), /inconclusive/)
      else runMutants(args)
      const outcomes = JSON.parse(readFileSync(join(receipts, 'mutant-outcomes.json')))
      assert.equal(outcomes.length, breakBuild ? 1 : 8)
      assert.ok(outcomes.every((item) => item.result === (breakBuild ? 'inconclusive' : 'caught')))
    } finally {
      rmSync(job, { recursive: true, force: true })
    }
  }
})
