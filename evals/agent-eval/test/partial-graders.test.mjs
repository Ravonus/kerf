import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

const tasks = ['large-live']
const root = new URL('../tasks/', import.meta.url)

function pageFor(_task, bad) {
  return {
    goto() {},
    waitForURL(predicate) {
      if (!predicate(new URL(bad ? 'http://test/' : 'http://test/signin')))
        throw new Error('wrong route')
    },
    getByLabel() {
      return { waitFor() {} }
    },
    getByRole() {
      return { waitFor() {} }
    },
  }
}

test('each new partial grader rejects a deliberately wrong fixture', async () => {
  const definitions = readdirSync(root, { withFileTypes: true }).filter((entry) =>
    entry.isDirectory(),
  )
  assert.equal(definitions.length, 6)
  for (const task of tasks) {
    const definition = JSON.parse(readFileSync(new URL(`${task}/task.json`, root)))
    assert.equal(definition.gradeable, false, `${task} must remain gated`)
    const { tests } = await import(new URL(`${task}/hidden.mjs`, root))
    assert.ok(tests.length, `${task} has no tests`)
    for (const check of tests) {
      await check.run({ page: pageFor(task, false), base: 'http://test' })
      await assert.rejects(
        check.run({ page: pageFor(task, true), base: 'http://test' }),
        undefined,
        `${task}: ${check.title} accepted a wrong fixture`,
      )
    }
  }
})
