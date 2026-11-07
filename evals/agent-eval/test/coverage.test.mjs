import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { firstRunGrade } from '../run/finish-run.mjs'

const root = new URL('..', import.meta.url)
const matrix = JSON.parse(readFileSync(new URL('../matrix.json', import.meta.url)))

test('the S5 plan includes every task definition exactly once', () => {
  const tasks = readdirSync(new URL('../tasks', import.meta.url), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  assert.equal(tasks.length, 6)
  assert.deepEqual([...matrix.tasks].sort(), tasks)
  assert.equal(new Set(matrix.tasks).size, tasks.length)
  assert.equal(matrix.reps, 1)
  assert.deepEqual(
    matrix.cells.map(({ stack, model }) => [stack, model]),
    [['weft-warp', 'gpt-6-luna']],
  )
  for (const task of tasks) {
    const definition = JSON.parse(readFileSync(join(root.pathname, 'tasks', task, 'task.json')))
    assert.ok(definition.wallMinutes > 0 && definition.budgetUsd > 0)
  }
})

test('first pass records a bad solution and its failure', () => {
  const rec = { first: {} }
  const grade = {
    passed: 0,
    total: 1,
    failed: [{ title: 'button counts', failure: 'expected 1, received 0' }],
    built: { ms: 7 },
  }
  firstRunGrade(rec, grade, (g) => g.passed === g.total)
  assert.equal(rec.first.pass, false)
  assert.deepEqual(rec.first.hidden.failed, grade.failed)
})
