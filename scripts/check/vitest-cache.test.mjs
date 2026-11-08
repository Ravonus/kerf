import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const packages = ['start', 'create']

void test('package caches have separate roots and survive concurrent cleanup', async () => {
  const paths = packages.map((name) => {
    const config = readFileSync(`packages/${name}/vitest.config.ts`, 'utf8')
    const match = /fsModuleCachePath:\s*'([^']+)'/.exec(config)
    assert.ok(match, `${name} needs an explicit module cache path`)
    return match[1]
  })
  assert.notEqual(paths[0], paths[1])
  assert.ok(paths.every((path) => !path.startsWith('node_modules/.vitest-cache/')))
  const root = mkdtempSync(join(tmpdir(), 'weft-vitest-cache-'))
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
    const run = (index) => new Promise((done, reject) => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', script,
        resolve(root, paths[index]), packages[index]])
      child.on('error', reject)
      child.on('close', done)
    })
    assert.deepEqual(await Promise.all([run(0), run(1)]), [0, 0])
    for (const [index, path] of paths.entries()) {
      assert.equal(readFileSync(resolve(root, path, 'marker'), 'utf8'), packages[index])
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
