import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, relative } from 'node:path'
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
  assert.deepEqual(
    problems.filter((line) => line.startsWith('--- ')),
    ['--- first', '--- second'],
  )
  assert.ok(!problems.some((line) => line.includes('line-0')))
  assert.ok(!child.stderr.includes('successful-secret-marker'))
  for (const label of ['first', 'second']) {
    assert.ok(child.stderr.includes(`--- ${label}`))
    assert.ok(child.stderr.includes(`${label}-line-0`))
  }
  assert.equal((child.stderr.match(/line-35/g) ?? []).length, 2)
  assert.equal((child.stderr.match(/line-74/g) ?? []).length, 2)
})

void test('package test workers share the outer jobs budget', () => {
  const manifests = execFileSync('git', ['ls-files', 'packages/*/package.json'], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter((file) => /^packages\/[^/]+\/package\.json$/.test(file))
  const packages = manifests.flatMap((file) => {
    const script = JSON.parse(readFileSync(file, 'utf8')).scripts?.test
    if (!script) return []
    assert.ok(script.endsWith('vitest run'), `${file}: the worker argument must reach Vitest`)
    return [file.slice(0, -'/package.json'.length)]
  })
  const dir = mkdtempSync(join(tmpdir(), 'kerf-check-workers-'))
  try {
    // Stub package commands so the dispatch check never starts product suites.
    const log = join(dir, 'calls.jsonl')
    const stub = join(dir, 'pnpm.mjs')
    writeFileSync(
      stub,
      `import { appendFileSync } from 'node:fs'
appendFileSync(${JSON.stringify(log)}, JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2) }) + '\\n')
`,
    )
    const windows = process.platform === 'win32'
    writeFileSync(
      join(dir, windows ? 'pnpm.cmd' : 'pnpm'),
      windows
        ? `@echo off\r\n"${process.execPath}" "${stub}" %*\r\n`
        : `#!/bin/sh\nexec "${process.execPath}" "${stub}" "$@"\n`,
      { mode: 0o755 },
    )
    const child = spawnSync(process.execPath, ['scripts/check.mjs', '--only=tests', '--jobs=2'], {
      env: { ...process.env, PATH: `${dir}${delimiter}${process.env.PATH ?? ''}` },
      encoding: 'utf8',
    })
    assert.equal(child.status, 0, child.stdout + child.stderr)
    const calls = readFileSync(log, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    assert.deepEqual(
      calls.map(({ cwd }) => relative(process.cwd(), cwd).replaceAll('\\', '/')).sort(),
      packages.sort(),
    )
    for (const { args } of calls) assert.deepEqual(args, ['test', '--maxWorkers=1'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
