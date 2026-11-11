import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const core = dirname(dirname(fileURLToPath(import.meta.url)))
const source = join(core, 'src/style')

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? files(path) : path.endsWith('.ts') ? [path] : []
  })
}

await test('generates and checks every tracked style input and helper', () => {
  const tracked = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', 'src/style'],
    {
      cwd: core,
      encoding: 'utf8',
    },
  )
    .trim()
    .split('\n')
    .filter((path) => path.endsWith('.ts'))
    .sort()
  const inputs = files(source)
    .map((path) => `src/style/${relative(source, path)}`)
    .sort()
  assert.deepEqual(inputs, tracked)

  const tmp = mkdtempSync(join(tmpdir(), 'kerf-node-style-'))
  try {
    cpSync(join(core, 'scripts/node-style.mjs'), join(tmp, 'scripts/node-style.mjs'), {
      recursive: true,
    })
    cpSync(source, join(tmp, 'src/style'), { recursive: true })
    const run = (...args) =>
      spawnSync(process.execPath, ['--no-warnings', join(tmp, 'scripts/node-style.mjs'), ...args], {
        encoding: 'utf8',
      })
    assert.equal(run().status, 0)
    assert.equal(run('--check').status, 0)
    for (const input of inputs) {
      const output = join(tmp, input.replace('src/style/', 'node/').replace(/\.ts$/, '.mjs'))
      const original = readFileSync(output, 'utf8')
      assert.equal(
        original.split('\n').length,
        readFileSync(join(tmp, input), 'utf8').split('\n').length,
      )
      writeFileSync(output, original + '\n// drift\n')
      assert.equal(run('--check').status, 1, `drift in ${output}`)
      writeFileSync(output, original)
      rmSync(output)
      assert.equal(run('--check').status, 1, `missing ${output}`)
      writeFileSync(output, original)
    }
    assert.equal(run('--check').status, 0)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})
