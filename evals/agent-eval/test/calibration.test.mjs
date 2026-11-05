import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { calibrationTarget } from '../run/calibration-target.mjs'

const entry = fileURLToPath(new URL('../run.mjs', import.meta.url))

test('calibration accepts only the fixed reference and named mutants', () => {
  assert.equal(calibrationTarget(['reference']), null)
  assert.equal(
    calibrationTarget(['mutant', 'wrong stock']).mustFail,
    'products show names, prices, stock and default order',
  )
  for (const args of [[], ['reference', '/tmp/app'], ['mutant', '../other'], ['run'], ['mutant']])
    assert.throws(() => calibrationTarget(args))
})

test('entrypoint refuses an arbitrary calibration target before loading the grader', () => {
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  const child = spawnSync(process.execPath, [entry, 'calibrate', 'mutant', '/tmp/app'], {
    env,
    encoding: 'utf8',
  })
  assert.equal(child.status, 2)
  assert.match(child.stderr, /unknown medium-shop mutant/)
})
