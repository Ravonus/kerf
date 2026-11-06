import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  passwordIsHashed,
  requireListener,
  requireRefusal,
} from '../evidence/T06/large-smoke-checks.mjs'

test('security verdicts reject success, wrong listener and plain credentials', () => {
  requireRefusal(403, 'origin', 403, 'Q010', { e: { code: 'Q010' } })
  assert.throws(
    () => requireRefusal(403, 'origin', 403, 'Q010', { e: { code: 'A002' } }),
    /unexpected refusal/,
  )
  requireListener([123], 123)
  passwordIsHashed([{ password: 'derived-hash' }], 'fixture-password')
  assert.throws(() => requireRefusal(200, 'origin', 403), /unexpected refusal/)
  assert.throws(() => requireRefusal(500, 'origin', 403), /unexpected refusal/)
  assert.throws(() => requireListener([124], 123), /inconclusive/)
  assert.throws(() => requireListener([123, 124], 123), /inconclusive/)
  assert.throws(
    () => passwordIsHashed([{ password: 'fixture-password' }], 'fixture-password'),
    /plain password/,
  )
  assert.throws(() => passwordIsHashed([], 'fixture-password'), /missing/)
})

test('manager script runs smoke only after reference build and installs browser closure', () => {
  const shell = readFileSync(
    new URL('../evidence/T06/yuna-large-reference.sh', import.meta.url),
    'utf8',
  )
  const build = shell.indexOf('evidence/T06/large-reference.mjs"')
  const install = shell.indexOf('browser-install.log')
  const smoke = shell.indexOf('evidence/T06/large-smoke.mjs"')
  assert.ok(build > 0 && build < install && install < smoke)
  assert.match(shell, /minimumReleaseAge/)
  assert.match(shell, /-v root="\$job"/)
})
