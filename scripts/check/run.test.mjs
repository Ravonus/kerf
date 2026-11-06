import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

void test('prints complete failed job output and keeps bounded problems', () => {
  const script = `
    import { allJobs } from './scripts/check/run.mjs'
    const lines = Array.from({ length: 75 }, (_, i) => 'line-' + i).join('\\n')
    const result = await allJobs(['quiet', 'first', 'second'], async (item) => ({
      code: item === 'quiet' ? 0 : 1,
      out: item === 'quiet' ? 'successful-secret-marker' : item + '-' + lines,
    }), 1)
    console.log(JSON.stringify(result))
  `
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  assert.equal(child.status, 0)
  const { problems } = JSON.parse(child.stdout)
  assert.equal(problems.length, 82)
  assert.deepEqual(problems.filter((line) => line.startsWith('--- ')), ['--- first', '--- second'])
  assert.ok(!problems.some((line) => line.includes('line-0')))
  assert.ok(!child.stderr.includes('successful-secret-marker'))
  for (const label of ['first', 'second']) {
    assert.ok(child.stderr.includes(`--- ${label}`))
    assert.ok(child.stderr.includes(`${label}-line-0`))
  }
  assert.equal((child.stderr.match(/line-35/g) ?? []).length, 2)
  assert.equal((child.stderr.match(/line-74/g) ?? []).length, 2)
})
