// @vitest-environment node
// The WASM build is the fallback on any platform without an addon, so it can't differ from the addon by a byte.
import { describe, expect, it } from 'vitest'
import { parity } from '../scripts/parity.mjs'

describe('native and WASM compilers', () => {
  it('return the same text for the whole corpus in every mode', () => {
    const r = parity()
    expect(r.files).toBeGreaterThan(100)
    expect(r.mismatches).toEqual([])
  }, 600_000)
})
