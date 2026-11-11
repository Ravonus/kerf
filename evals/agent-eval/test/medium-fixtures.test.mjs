import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'
import { tests } from '../tasks/medium-shop/hidden.mjs'

const root = new URL('../tasks/medium-shop/', import.meta.url)

test('every named medium mutant targets a reference and a real check', () => {
  const mutants = JSON.parse(readFileSync(new URL('mutants.json', root)))
  const files = readdirSync(new URL('reference/kerf-veneer/src/routes/', root))
  const sources = files.map((name) =>
    readFileSync(new URL(`reference/kerf-veneer/src/routes/${name}`, root), 'utf8'),
  )
  assert.ok(mutants.length >= 30)
  for (const mutant of mutants) {
    assert.equal(
      sources.reduce((n, source) => n + source.split(mutant.find).length - 1, 0),
      1,
      mutant.name,
    )
    assert.ok(
      tests.some((check) => check.title === mutant.mustFail),
      mutant.name,
    )
    assert.notEqual(mutant.find, mutant.replace, mutant.name)
  }
})
