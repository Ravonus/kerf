// @vitest-environment node
// What an app built on the kit prints: nothing. Every warning here would land in a stranger's terminal, for code they
// didn't write and can't fix.
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { expect, test } from 'vitest'

const { transform } = createRequire(import.meta.url)('../../core/compiler.cjs')
const src = fileURLToPath(new URL('../src', import.meta.url))
const sources = readdirSync(src, { recursive: true, encoding: 'utf8' })
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => join(src, f))

test('the kit compiles without a diagnostic', () => {
  expect(sources.length).toBeGreaterThan(50)
  const said = sources.flatMap((filename) =>
    (
      transform(readFileSync(filename, 'utf8'), { filename, generate: 'dom', dev: true })
        .diagnostics ?? []
    ).map(
      (d: { line: number; code: string; message: string }) =>
        `${filename}:${d.line} ${d.code} ${d.message}`,
    ),
  )
  expect(said).toEqual([])
})
