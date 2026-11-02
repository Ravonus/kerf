import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll } from 'vitest'

export const fixture = fileURLToPath(new URL('../../../evals/reference-v3/weft/', import.meta.url))
export const bin = fileURLToPath(new URL('../bin/weft.mjs', import.meta.url))
const tmpRoot = fileURLToPath(new URL('./.tmp/', import.meta.url))

const made = []
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

/**
 * A copy of the v3 reference app inside this package (so `zod` and `@weft-js/core/config` resolve from it), with edits.
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

/** The v3 spread habit: every price push gives every product a new identity. */
export const spreadBug = ['products.value.map(p => (p.id === id ? { ...p, price } : p))', 'products.value.map(p => ({ ...p, price: p.id === id ? price : p.price }))']
