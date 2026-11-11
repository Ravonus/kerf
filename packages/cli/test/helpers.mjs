import { strict as assert } from 'node:assert'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll } from 'vitest'

export const fixture = fileURLToPath(new URL('../../../evals/reference-v3/kerf/', import.meta.url))
export const bin = fileURLToPath(new URL('../bin/kerf.mjs', import.meta.url))
const tmpRoot = fileURLToPath(new URL('./.tmp/', import.meta.url))

const made = []
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

/**
 * A copy of the v3 reference app inside this package (so `zod` and `@kerf-js/core/config` resolve from it), with edits.
 * @param {Record<string, string>} files extra or replaced files
 * @param {(src: Record<string, string>) => void} [edit]
 */
export function project(files = {}) {
  mkdirSync(tmpRoot, { recursive: true })
  const dir = mkdtempSync(join(tmpRoot, 'p-'))
  made.push(dir)
  cpSync(fixture, dir, { recursive: true })
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(dir, rel, '..'), { recursive: true })
    writeFileSync(join(dir, rel), text)
  }
  return dir
}

const startFixture = fileURLToPath(new URL('../../start/test/fixtures/app/', import.meta.url))
const startTmp = fileURLToPath(new URL('../../start/test/.tmp/', import.meta.url))

/**
 * A copy of start's fixture app, beside it in packages/start so `@kerf-js/start` still resolves from the workspace.
 * `kerf check` rewrites `.kerf/slots`, and start's suite binds the media route there while its dev server runs: checking
 * the original while both suites run at once unbinds that route, and start's upload tests get a 500.
 */
export function startApp() {
  mkdirSync(startTmp, { recursive: true })
  const dir = mkdtempSync(join(startTmp, 'app-'))
  made.push(dir)
  cpSync(startFixture, dir, { recursive: true, filter: (src) => basename(src) !== '.kerf' })
  return dir
}

/** Plant the v3 spread habit: every price push gives every product a new identity. */
export function spreadBug(src) {
  const needle =
    /products\.value\.map\(\s*\(?p\)?\s*=>\s*\(\s*p\.id\s*===\s*id\s*\?\s*\{\s*\.\.\.p,\s*price\s*\}\s*:\s*p\s*\)\s*\)/
  const result = src.replace(
    needle,
    'products.value.map((p) => ({ ...p, price: p.id === id ? price : p.price }))',
  )
  assert.notEqual(result, src, 'spread bug must change the fixture')
  return result
}
