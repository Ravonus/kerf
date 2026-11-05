import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { taskReadiness } from '../run/readiness.mjs'
import { tests } from '../tasks/medium-shop/hidden.mjs'

const root = fileURLToPath(new URL('../tasks/medium-shop/', import.meta.url))
const read = (name) => JSON.parse(readFileSync(join(root, name), 'utf8'))
function filesIn(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) filesIn(path, out)
    else if (!['task.json', 'verification.json'].includes(entry.name))
      out.push(relative(root, path))
  }
  return out.sort()
}

test('verified medium metadata, source and readiness agree', () => {
  const task = read('task.json'),
    evidence = read('verification.json'),
    mutants = read('mutants.json')
  assert.equal(task.gradeable, true)
  assert.deepEqual(taskReadiness('medium-shop', task), [])
  assert.deepEqual(taskReadiness('medium-shop', { ...task, gradeable: false }), [
    'medium-shop: grader is incomplete',
  ])
  assert.equal(evidence.candidate, '9f5436f431cfd6c0bd439fca33ab7b1d5afaf5be')
  assert.equal(
    evidence.receiptSha256,
    '198528f4b58663c6f1c2880f474f2add1c69db6e0b3b02a34721d9d7ffa966a0',
  )
  assert.equal(tests.length, evidence.referenceChecks)
  assert.equal(mutants.length, evidence.mutantsCaught)
  assert.deepEqual(filesIn(root), Object.keys(evidence.files).sort())
  for (const [file, expected] of Object.entries(evidence.files)) {
    const data = readFileSync(join(root, file))
    const blob = createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex')
    assert.equal(blob, expected, file)
  }
  for (const name of ['edit-shop', 'bugfix-shop', 'large-live']) {
    const pending = JSON.parse(readFileSync(new URL(`../tasks/${name}/task.json`, import.meta.url)))
    assert.equal(pending.gradeable, false)
    assert.deepEqual(taskReadiness(name, pending), [`${name}: grader is incomplete`])
  }
})
