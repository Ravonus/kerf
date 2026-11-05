import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { preparedTests } from '../tasks/large-live/checks.mjs'

const coverage = JSON.parse(
  readFileSync(new URL('../tasks/large-live/coverage.json', import.meta.url)),
)
function checkCoverage(checks) {
  assert.equal(checks.length, 3)
  for (const item of coverage.covered)
    assert.equal(checks.filter((check) => check.title === item.check).length, 1, item.id)
}

test('prepared large checks match their partial coverage and remain disabled', () => {
  checkCoverage(preparedTests)
  assert.throws(() => checkCoverage(preparedTests.slice(1)), /3/)
  const task = JSON.parse(readFileSync(new URL('../tasks/large-live/task.json', import.meta.url)))
  assert.equal(task.gradeable, false)
  assert.ok(coverage.missing.length)
})
