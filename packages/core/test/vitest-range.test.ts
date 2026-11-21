// `@kerf-js/core/test` augments Vitest's `Assertion` with its matchers. TypeScript merges an interface only when every
// declaration has the same type parameters, and Vitest 4's `Assertion<T>` differs from Vitest 5's `Assertion<R, T>`:
// the peer range has to start where the augmentation compiles, or an app on Vitest 4 installs cleanly and fails tsc.
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { expect, test } from 'vitest'

const core = join(import.meta.dirname, '..')
const read = (file: string) => readFileSync(file, 'utf8')

test("the vitest peer range starts at the first Vitest whose Assertion the matchers' types merge with", () => {
  const ours = /declare module 'vitest' \{\s*interface Assertion<([^>]*)>/.exec(
    read(join(core, 'src/test-support/touches.ts')),
  )?.[1]
  expect(ours).toBe('R, T')
  // the Vitest this repo tests against declares it the same way: `Assertion<R …, T …>`
  const vitest = dirname(createRequire(join(core, 'package.json')).resolve('vitest/package.json'))
  const chunks = join(vitest, 'dist/chunks')
  const declared = readdirSync(chunks)
    .filter((f) => f.endsWith('.d.ts'))
    .some((f) => /\ninterface Assertion<\s*R extends [^\n]*\n\s*T\b/.test(read(join(chunks, f))))
  expect(declared).toBe(true)
  const major = Number(JSON.parse(read(join(vitest, 'package.json'))).version.split('.')[0])
  const range = JSON.parse(read(join(core, 'package.json'))).peerDependencies.vitest as string
  // Vitest 5 is the first with `Assertion<R, T>`; Vitest 4 has `Assertion<T>`
  expect(range).toBe('>=5')
  expect(major).toBeGreaterThanOrEqual(5)
})
