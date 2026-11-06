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
  return out.sort((a, b) => a.localeCompare(b))
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
  assert.deepEqual(
    filesIn(root),
    Object.keys(evidence.files).sort((a, b) => a.localeCompare(b)),
  )
  for (const [file, expected] of Object.entries(evidence.files)) {
    const data = readFileSync(join(root, file))
    const blob = createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex')
    assert.equal(blob, expected, file)
  }
  for (const name of ['large-live']) {
    const pending = JSON.parse(readFileSync(new URL(`../tasks/${name}/task.json`, import.meta.url)))
    assert.equal(pending.gradeable, false)
    assert.deepEqual(taskReadiness(name, pending), [`${name}: grader is incomplete`])
  }
})

test('verified edit metadata, source and readiness agree', async () => {
  const editRoot = fileURLToPath(new URL('../tasks/edit-shop/', import.meta.url))
  const task = JSON.parse(readFileSync(join(editRoot, 'task.json')))
  const evidence = JSON.parse(readFileSync(join(editRoot, 'verification.json')))
  const mutants = JSON.parse(readFileSync(join(editRoot, 'mutants.json')))
  const { tests: editTests } = await import('../tasks/edit-shop/hidden.mjs')
  assert.equal(task.gradeable, true)
  assert.deepEqual(taskReadiness('edit-shop', task), [])
  assert.deepEqual(taskReadiness('edit-shop', { ...task, gradeable: false }), [
    'edit-shop: grader is incomplete',
  ])
  assert.equal(evidence.candidate, 'a06371b148a4bab640f0aa2eb48556ddf6728661')
  assert.equal(
    evidence.receiptSha256,
    '85dfc6a0db7f51ab51dca25fffc14d926dda40235fe62a63a30fc3ef1cceb085',
  )
  assert.equal(editTests.length, evidence.referenceChecks)
  assert.equal(mutants.length, evidence.mutantsCaught)
  const listed = []
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, e.name)
      if (e.isDirectory()) walk(path)
      else if (!['task.json', 'verification.json'].includes(e.name))
        listed.push(relative(editRoot, path))
    }
  }
  walk(editRoot)
  assert.deepEqual(
    listed.sort((a, b) => a.localeCompare(b)),
    Object.keys(evidence.files).sort((a, b) => a.localeCompare(b)),
  )
  for (const [file, expected] of Object.entries(evidence.files)) {
    const data = readFileSync(join(editRoot, file))
    assert.equal(
      createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex'),
      expected,
      file,
    )
  }
})

test('verified bugfix metadata, source and readiness agree', async () => {
  const bugfixRoot = fileURLToPath(new URL('../tasks/bugfix-shop/', import.meta.url))
  const task = JSON.parse(readFileSync(join(bugfixRoot, 'task.json')))
  const evidence = JSON.parse(readFileSync(join(bugfixRoot, 'verification.json')))
  const mutants = JSON.parse(readFileSync(join(bugfixRoot, 'mutants.json')))
  const { calibrationTests: bugfixTests } = await import('../tasks/bugfix-shop/hidden.mjs')
  assert.equal(task.gradeable, true)
  assert.deepEqual(taskReadiness('bugfix-shop', task), [])
  assert.deepEqual(taskReadiness('bugfix-shop', { ...task, gradeable: false }), [
    'bugfix-shop: grader is incomplete',
  ])
  assert.equal(evidence.candidate, '90dcfd2eb24394b6185af0429c8d04157e9346e1')
  assert.equal(
    evidence.receiptSha256,
    '35574460ffb87c7143cc2f0ca2dedd0dfc5c3eaa2b91a636a1568f725001dbd0',
  )
  assert.equal(bugfixTests.length, evidence.referenceChecks)
  assert.equal(mutants.length, evidence.mutantsCaught)
  const listed = []
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, e.name)
      if (e.isDirectory()) walk(path)
      else if (!['task.json', 'verification.json'].includes(e.name))
        listed.push(relative(bugfixRoot, path))
    }
  }
  walk(bugfixRoot)
  assert.deepEqual(
    listed.sort((a, b) => a.localeCompare(b)),
    Object.keys(evidence.files).sort((a, b) => a.localeCompare(b)),
  )
  for (const [file, expected] of Object.entries(evidence.files)) {
    const data = readFileSync(join(bugfixRoot, file))
    assert.equal(
      createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex'),
      expected,
      file,
    )
  }
})
