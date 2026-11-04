import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { commands, eq, localPackages, makeCheck, repo, until } from '../lib/gate.mjs'

test('local dependencies resolve to packages with the requested npm name', () => {
  const pkg = localPackages(repo)
  for (const name of ['core', 'warp-icons', 'create']) {
    const expected = `@weft-js/${name}`
    const manifest = JSON.parse(readFileSync(new URL(`${pkg(expected)}/package.json`), 'utf8'))
    assert.equal(manifest.name, expected)
  }
  assert.throws(() => readFileSync(new URL(`${pkg('@weft-js/missing')}/package.json`)), /ENOENT/)
})

test('commands preserve cwd, environment, and failures', () => {
  const { run, must } = commands(process.cwd(), 1 << 26)
  assert.equal(run(process.execPath, ['-p', 'process.cwd()']).stdout.trim(), process.cwd())
  assert.throws(() => must(process.execPath, ['-e', 'process.exit(2)']))
  const env = commands(process.cwd(), 1 << 28, true)
  assert.equal(env.must(process.execPath, ['-p', 'process.env.GATE_TEST'], undefined, { GATE_TEST: 'yes' }).stdout.trim(), 'yes')
})

test('until and eq accept success and reject bad input', async () => {
  assert.equal(await until('value', () => 'ready', 10), 'ready')
  await assert.rejects(until('value', () => { throw new Error('bad') }, 0), /timed out waiting for value/)
  eq({ a: 1 }, { a: 1 }, 'object')
  assert.throws(() => eq(1, 2, 'number'), /number: got 1, want 2/)
})

test('check records success and failure', async () => {
  const checks = []
  const logs = []
  const check = makeCheck(checks, (s) => logs.push(s), 120)
  await check('good', () => 'detail')
  await check('bad', () => { throw new Error('broken') })
  assert.equal(checks[0].ok, true)
  assert.equal(checks[0].detail, 'detail')
  assert.deepEqual(checks[1], { name: 'bad', ok: false, error: 'broken' })
  assert.match(logs[1], /FAIL: bad/)
})
