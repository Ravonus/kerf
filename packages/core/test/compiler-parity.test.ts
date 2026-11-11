// @vitest-environment node
// The WASM build is the fallback on any platform without an addon, so it can't differ from the addon by a byte.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parity } from '../scripts/parity.mjs'

describe('native and WASM compilers', () => {
  it('return the same text for the whole corpus in every mode', () => {
    const r = parity()
    expect(r.files).toBeGreaterThan(100)
    expect(r.mismatches).toEqual([])
  }, 600_000)

  it('KERF_COMPILER picks the build, and each compiles through compiler.cjs', () => {
    const compiler = fileURLToPath(new URL('../compiler.cjs', import.meta.url))
    const run = (kind: string) =>
      JSON.parse(
        execFileSync(
          process.execPath,
          [
            '-e',
            `
      const c = require(${JSON.stringify(compiler)})
      console.log(JSON.stringify({ kind: c.backend.kind, code: c.transform('export const A = () => <p>x</p>', { filename: process.cwd() + '/src/a.tsx', dev: true }).code }))
    `,
          ],
          { env: { ...process.env, KERF_COMPILER: kind }, encoding: 'utf8' },
        ),
      )
    const [native, wasm] = [run('native'), run('wasm')]
    expect([native.kind, wasm.kind]).toEqual(['native', 'wasm'])
    expect(wasm.code).toBe(native.code)
  })
})
