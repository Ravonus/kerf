import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

const tasks = ['bugfix-shop', 'edit-shop', 'large-live']
const root = new URL('../tasks/', import.meta.url)

function pageFor(task, bad) {
  let pressed = false
  return {
    async goto() {},
    async reload() {
      if (bad && task === 'edit-shop') pressed = false
    },
    async waitForURL(predicate) {
      if (!predicate(new URL(bad ? 'http://test/' : 'http://test/signin')))
        throw new Error('wrong route')
    },
    getByLabel() {
      return { async fill() {}, async waitFor() {} }
    },
    getByRole(_role, options) {
      if (options.name === 'Cart')
        return {
          getByText(name) {
            return {
              async waitFor() {
                if (bad) throw new Error(`wrong cart product: ${name}`)
              },
            }
          },
        }
      return {
        async click() {
          pressed = true
        },
        async waitFor() {},
        async getAttribute() {
          return String(pressed)
        },
      }
    },
    getByText() {
      return {
        async count() {
          return bad ? 0 : 1
        },
      }
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
