import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { tests } from '../tasks/medium-shop/hidden.mjs'

const root = new URL('../tasks/medium-shop/', import.meta.url)
const manifest = JSON.parse(readFileSync(new URL('coverage.json', root)))
const mutants = JSON.parse(readFileSync(new URL('mutants.json', root)))
const requirements = [
  'stock_apple',
  'stock_banana',
  'stock_bagel',
  'stock_brioche',
  'stock_milk',
  'stock_yogurt',
  'product_prices',
  'product_list',
  'product_add_labels',
  'default_name_sort',
  'case_insensitive_search',
  'category_filter',
  'price_sort',
  'product_count_plural',
  'tab_search_state',
  'tab_category_state',
  'tab_sort_state',
  'tab_cart_state',
  'cart_quantity',
  'cart_line_total',
  'cart_total',
  'cart_increase',
  'cart_decrease',
  'cart_stock_limit',
  'cart_remove',
  'cart_empty',
  'name_required',
  'email_required_and_valid',
  'card_required_and_digits',
  'name_description',
  'email_description',
  'card_description',
  'name_invalid_flag',
  'email_invalid_flag',
  'card_invalid_flag',
  'first_invalid_focus',
  'invalid_keeps_input',
  'valid_card_spaces',
  'valid_order_clears',
  'valid_order_thanks',
  'cart_list',
  'category_options',
  'sort_options',
  'product_count_zero',
]

function checkCoverage(checks) {
  assert.deepEqual(manifest.map((entry) => entry.requirement).sort(), [...requirements].sort())
  assert.equal(new Set(manifest.map((entry) => entry.requirement)).size, requirements.length)
  for (const entry of manifest) {
    assert.equal(checks.filter((check) => check.title === entry.check).length, 1, entry.requirement)
    const matching = mutants.filter((mutant) => mutant.name === entry.mutant)
    assert.equal(matching.length, 1, entry.requirement)
    assert.equal(matching[0].mustFail, entry.check, entry.requirement)
  }
}

test('each listed medium requirement has its named check and mutant', () => {
  checkCoverage(tests)
})

test('coverage rejects removal of a promised check', () => {
  const withoutStock = tests.filter((entry) => entry.title !== 'stock boundary for Apple')
  assert.throws(() => checkCoverage(withoutStock), /stock_apple/)
})
