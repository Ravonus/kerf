import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { test } from 'node:test'

// Vitest's default module cache is the workspace root's node_modules/.vitest-cache. Every config that leaves
// fsModuleCachePath unset shares it, and parallel package runs then clear it under each other (ENOTEMPTY).
const configs = execFileSync('git', ['ls-files', '*vitest.config.*', '**/vitest.config.*'], {
  encoding: 'utf8',
})
  .split('\n')
  .filter((file) => /(^|\/)vitest\.config\.[cm]?[jt]s$/.test(file))
const workspaceDefault = resolve('node_modules/.vitest-cache')

const cachePath = (source) => /fsModuleCachePath:\s*(['`])([^'`]+)\1/.exec(source)?.[2]
// The fixed part of the path (a template's text before its first `${`), resolved against the package the config
// runs in. A config may take it from a shared config it imports, as the realtime packages do.
const cacheRoot = (file) => {
  const source = readFileSync(file, 'utf8')
  const shared = /from '(\.{1,2}\/[^']+\.config\.mjs)'/.exec(source)?.[1]
  const path =
    cachePath(source) ?? (shared && cachePath(readFileSync(resolve(dirname(file), shared), 'utf8')))
  assert.ok(path, `${file} needs its own fsModuleCachePath`)
  return resolve(dirname(file), path.split('${')[0])
}
const inside = (child, parent) =>
  child === parent || !relative(parent, child).startsWith('..' + sep)

void test('every Vitest config keeps its module cache in a folder of its own', () => {
  assert.ok(configs.length > 20, 'found the Vitest configs')
  const roots = configs.map((file) => [file, cacheRoot(file)])
  for (const [file, root] of roots) {
    assert.ok(
      !inside(workspaceDefault, root) && !inside(root, workspaceDefault),
      `${file} shares the root cache`,
    )
    for (const [other, otherRoot] of roots) {
      if (other !== file)
        assert.ok(!inside(root, otherRoot), `${file} caches inside ${other}'s cache`)
    }
  }
})

void test('separate caches survive concurrent cleanup', async () => {
  const roots = configs.map((file) => relative(process.cwd(), cacheRoot(file)))
  const scratch = mkdtempSync(join(tmpdir(), 'kerf-vitest-cache-'))
  try {
    const script = `
      import { mkdir, writeFile, rm } from 'node:fs/promises'
      const [own, marker] = process.argv.slice(1)
      await mkdir(own, { recursive: true })
      await writeFile(own + '/marker', marker)
      await new Promise((done) => setTimeout(done, 80))
      await rm(own, { recursive: true, force: true })
      await mkdir(own, { recursive: true })
      await writeFile(own + '/marker', marker)
    `
    const run = (path, marker) =>
      new Promise((done, reject) => {
        const child = spawn(process.execPath, [
          '--input-type=module',
          '-e',
          script,
          resolve(scratch, path),
          marker,
        ])
        child.on('error', reject)
        child.on('close', done)
      })
    const codes = await Promise.all(roots.map((path, index) => run(path, configs[index])))
    assert.ok(codes.every((code) => code === 0))
    for (const [index, path] of roots.entries()) {
      assert.equal(readFileSync(resolve(scratch, path, 'marker'), 'utf8'), configs[index])
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
})
