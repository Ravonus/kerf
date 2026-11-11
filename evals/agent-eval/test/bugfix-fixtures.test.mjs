import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { tests as medium } from '../tasks/medium-shop/hidden.mjs'
import { tests, calibrationTests } from '../tasks/bugfix-shop/hidden.mjs'

const root = new URL('../tasks/bugfix-shop/', import.meta.url)
const mediumRoot = new URL('../tasks/medium-shop/', import.meta.url)
const ids = [
  'filtered_product_identity',
  'post_cart_identity',
  'sorted_product_identity',
  'total_after_add',
  'total_after_increase',
  'line_quantity',
  'line_subtotal',
  'line_removal',
  'total_after_decrease',
  'empty_total',
]
const read = (path) => readFileSync(new URL(path, root), 'utf8')
const compact = (text) => text.replace(/\s+/g, '').replace(/,\)/g, ')')

function checkCoverage(checks, mutants) {
  const coverage = JSON.parse(read('coverage.json'))
  assert.deepEqual(coverage.requirements.map((entry) => entry.id).sort(), [...ids].sort())
  assert.equal(mutants.length, 8, 'mutant count')
  assert.equal(new Set(mutants.map((mutant) => mutant.name)).size, 8, 'unique mutants')
  for (const entry of coverage.requirements) {
    assert.equal(checks.filter((check) => check.title === entry.check).length, 1, entry.id)
    const matches = mutants.filter((mutant) => mutant.name === entry.mutant)
    assert.equal(matches.length, 1, entry.id)
    assert.equal(matches[0].mustFail, entry.check, entry.id)
  }
}

test('bugfix reference preserves medium behavior and starter plants only two documented defects', () => {
  const source = new URL('reference/kerf-veneer/src/routes/', mediumRoot)
  for (const file of readdirSync(source)) {
    let reference = readFileSync(new URL(file, source), 'utf8')
    if (file === 'shop-state.ts')
      reference = reference
        .replace(
          "['Enter a name', 'Enter a valid email', 'Enter 16 digits'][i]!",
          "(['Enter a name', 'Enter a valid email', 'Enter 16 digits'][i] ?? '')",
        )
        .replace("['name', 'email', 'card'][first]!", "['name', 'email', 'card'][first] ?? ''")
    assert.equal(
      compact(read(`reference/kerf-veneer/src/routes/${file}`)),
      compact(reference),
      file,
    )
    let starter = reference
    if (file === 'shop-state.ts')
      starter = starter
        .replace(
          '  const cart = state<Record<string, number>>({})',
          '  const cart = state<Record<string, number>>({})\n  const staleCart = state<Record<string, number>>({})',
        )
        .replace(
          'n + p.price * (cart.value[p.name] ?? 0)',
          'n + p.price * (staleCart.value[p.name] ?? 0)',
        )
        .replace(
          'cart.value = { ...cart.value, [p.name]: quantity }',
          'staleCart.value = cart.value\n    cart.value = { ...cart.value, [p.name]: quantity }',
        )
    if (file === 'products.tsx')
      starter = starter
        .replace(
          "import { money } from './shop-state'",
          "import { money, products } from './shop-state'",
        )
        .replace('m.shown.value.map((p) => {', 'm.shown.value.map((p, index) => {')
        .replace(
          'onClick={() => m.change(p, 1)}',
          'onClick={() => m.change(products[index] ?? p, 1)}',
        )
    assert.equal(compact(read(`starter/kerf-veneer/src/routes/${file}`)), compact(starter), file)
  }
  assert.equal(tests.length, 1)
  assert.equal(calibrationTests.length, 14)
  assert.deepEqual(calibrationTests.slice(0, medium.length), medium)
  assert.equal(
    createHash('sha256')
      .update(readFileSync(new URL('mutants.json', mediumRoot)))
      .digest('hex'),
    '40d518f14bbb69b11313f2d47f548d8a1d2cd997d6b73769d9c7c2c6cdd42931',
  )
})

test('each bugfix requirement maps to a named check and uniquely targeted mutation', () => {
  const mutants = JSON.parse(read('mutants.json'))
  const coverage = JSON.parse(read('coverage.json'))
  const inherited = JSON.parse(readFileSync(new URL('coverage.json', mediumRoot)))
  const mediumMutants = JSON.parse(readFileSync(new URL('mutants.json', mediumRoot)))
  assert.equal(
    coverage.inherits.immutableMutantsSha256,
    '40d518f14bbb69b11313f2d47f548d8a1d2cd997d6b73769d9c7c2c6cdd42931',
  )
  assert.equal(inherited.length, 44)
  for (const entry of inherited) {
    assert.equal(
      calibrationTests.filter((check) => check.title === entry.check).length,
      1,
      entry.requirement,
    )
    assert.equal(
      mediumMutants.filter(
        (mutant) => mutant.name === entry.mutant && mutant.mustFail === entry.check,
      ).length,
      1,
      entry.requirement,
    )
  }
  const routes = new URL('reference/kerf-veneer/src/routes/', root)
  const sources = readdirSync(routes).map((file) =>
    readFileSync(join(routes.pathname, file), 'utf8'),
  )
  checkCoverage(calibrationTests, mutants)
  for (const mutant of mutants) {
    assert.equal(
      sources.reduce((n, source) => n + source.split(mutant.find).length - 1, 0),
      1,
      mutant.name,
    )
    assert.equal(
      calibrationTests.filter((check) => check.title === mutant.mustFail).length,
      1,
      mutant.name,
    )
  }
  assert.throws(
    () =>
      checkCoverage(
        calibrationTests.filter(
          (check) => check.title !== 'search and return preserve product identity',
        ),
        mutants,
      ),
    /filtered_product_identity/,
  )
  assert.throws(
    () =>
      checkCoverage(
        calibrationTests,
        mutants.filter((mutant) => mutant.name !== 'stale total snapshot'),
      ),
    /mutant count/,
  )
})
