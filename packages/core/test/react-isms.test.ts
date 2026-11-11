// @vitest-environment node
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { transform } = require('../compiler.cjs')
const fixtures = new URL('../../../evals/buggy-v4/kerf/react-isms/', import.meta.url)

const cases = [
  ['state', 'useState', 'state(initial)'],
  ['effect', 'useEffect', 'watch(() => source'],
  ['memo', 'useMemo', 'derived(() => expression)'],
  ['ref', 'useRef', 'ref={el}'],
  ['callback', 'useCallback', 'plain function'],
  ['wrapper', 'useCart', 'ordinary function'],
  ['dependencies', 'dependency array', 'tracked'],
] as const

describe('buggy-v4 React habits', () => {
  for (const [name, message, help] of cases) {
    it(`reports ${name} and accepts its repair`, () => {
      const compile = (file: string) =>
        transform(readFileSync(new URL(file, fixtures), 'utf8'), { filename: file, dev: true })
      const bad = compile(`${name}.tsx`)
      expect(bad.diagnostics).toHaveLength(name === 'wrapper' ? 2 : 1)
      expect(
        bad.diagnostics.every(
          (d: { code: string; severity: string }) => d.code === 'W020' && d.severity === 'error',
        ),
      ).toBe(true)
      expect(
        bad.diagnostics.some(
          (d: { message: string; help: string }) =>
            d.message.includes(message) && d.help.includes(help),
        ),
      ).toBe(true)
      const fixed = compile(`${name}.fixed.tsx`)
      expect(fixed.diagnostics).toEqual([])
      expect(fixed.code).toBeTruthy()
    })
  }
})
