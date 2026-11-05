import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { tests } from '../tasks/edit-shop/hidden.mjs'
import { tests as medium } from '../tasks/medium-shop/hidden.mjs'
import { calibrationTarget } from '../run/calibration-target.mjs'

const root = new URL('../tasks/edit-shop/', import.meta.url)
const mediumRoot = new URL('../tasks/medium-shop/', import.meta.url)
const ids = [
  'product_live_price',
  'cart_live_price',
  'total_live_price',
  'subscribe_updates',
  'flash_starts',
  'flash_expires',
  'favourite_aria',
  'favourite_filter',
  'favourite_persistence',
  'favourite_toggle',
  'price_rise_warning',
  'price_drop_no_warning',
  'new_cart_baseline',
  'live_price_sort',
  'unchanged_no_flash',
  'flash_duration',
]

test('edit starter preserves medium source with safe index fallbacks', () => {
  const source = new URL('reference/weft-warp/src/routes/', mediumRoot)
  const starter = new URL('starter/weft-warp/src/routes/', root)
  for (const file of readdirSync(source)) {
    let expected = readFileSync(new URL(file, source), 'utf8')
    if (file === 'shop-state.ts') {
      expected = expected
        .replace(
          "['Enter a name', 'Enter a valid email', 'Enter 16 digits'][i]!",
          "(['Enter a name', 'Enter a valid email', 'Enter 16 digits'][i] ?? '')",
        )
        .replace("['name', 'email', 'card'][first]!", "['name', 'email', 'card'][first] ?? ''")
    }
    assert.equal(readFileSync(new URL(file, starter), 'utf8'), expected, file)
  }
  assert.equal(medium.length, 12)
  assert.equal(tests.length, 17)
  assert.deepEqual(tests.slice(0, medium.length), medium)
  const hash = createHash('sha256')
    .update(readFileSync(new URL('mutants.json', mediumRoot)))
    .digest('hex')
  assert.equal(hash, '40d518f14bbb69b11313f2d47f548d8a1d2cd997d6b73769d9c7c2c6cdd42931')
})

test('edit requirements map to one reference mutation and one named check', () => {
  const coverage = JSON.parse(readFileSync(new URL('coverage.json', root)))
  const mutants = JSON.parse(readFileSync(new URL('mutants.json', root)))
  const routes = new URL('reference/weft-warp/src/routes/', root)
  const sources = readdirSync(routes).map((file) =>
    readFileSync(join(routes.pathname, file), 'utf8'),
  )
  assert.equal(
    coverage.inherits.immutableMutantsSha256,
    '40d518f14bbb69b11313f2d47f548d8a1d2cd997d6b73769d9c7c2c6cdd42931',
  )
  assert.deepEqual(coverage.requirements.map((entry) => entry.id).sort(), [...ids].sort())
  assert.equal(mutants.length, 18)
  for (const mutant of mutants) {
    assert.equal(
      sources.reduce((n, source) => n + source.split(mutant.find).length - 1, 0),
      1,
      mutant.name,
    )
    assert.equal(tests.filter((check) => check.title === mutant.mustFail).length, 1, mutant.name)
    assert.equal(calibrationTarget(['edit-shop', 'mutant', mutant.name]).mutant.name, mutant.name)
  }
  for (const entry of coverage.requirements) {
    const matched = mutants.filter((mutant) => mutant.name === entry.mutant)
    assert.equal(matched.length, 1, entry.id)
    assert.equal(matched[0].mustFail, entry.check, entry.id)
  }
  assert.throws(
    () => calibrationTarget(['edit-shop', 'mutant', 'wrong stock']),
    /unknown edit-shop mutant/,
  )
})
