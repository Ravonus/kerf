import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const entry = fileURLToPath(new URL('../run.mjs', import.meta.url))
function invoke(mode) {
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  return spawnSync(process.execPath, [entry, 'fixture', mode], { encoding: 'utf8', env })
}

test('entrypoint reaches mocked backend and both policy-controlled installs', () => {
  const child = invoke('success')
  assert.equal(child.status, 0, child.stderr)
  const receipt = JSON.parse(child.stdout)
  assert.equal(receipt.ok, true)
  assert.equal(receipt.passAt1, true)
  assert.equal(receipt.installs, 2)
  assert.equal(receipt.grades, 1)
  assert.equal(receipt.backend.usage.input, 4)
  assert.doesNotMatch(child.stdout + child.stderr, /fixture-secret/)
})

test('entrypoint fails closed on backend failure without grading or secrets', () => {
  const child = invoke('failure')
  assert.equal(child.status, 1, child.stderr)
  const receipt = JSON.parse(child.stdout)
  assert.equal(receipt.ok, false)
  assert.equal(receipt.passAt1, null)
  assert.equal(receipt.grades, 0)
  assert.equal(receipt.installs, 2)
  assert.doesNotMatch(child.stdout + child.stderr, /fixture-secret/)
})
