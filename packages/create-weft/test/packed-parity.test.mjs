import { basename, join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkClientParity, parityDirs } from '../scripts/packed-paths.mjs'

describe('packed compiler parity', () => {
  it('gives both apps the same name and relative path to the tarballs', () => {
    const native = join('/gate', parityDirs.default)
    const wasm = join('/gate', parityDirs.wasm)
    expect(basename(native)).toBe(basename(wasm))
    expect(relative(native, '/gate/tgz')).toBe(relative(wasm, '/gate/tgz'))
  })

  it('rejects different names and bytes, including invalid UTF-8', () => {
    const native = { 'client.js.br': Buffer.from([0xff]) }
    expect(() => checkClientParity(native, { 'client.js.br': Buffer.from([0xff]) })).not.toThrow()
    expect(() => checkClientParity(native, { 'other.js.br': Buffer.from([0xff]) })).toThrow()
    expect(() => checkClientParity(native, { 'client.js.br': Buffer.from([0xfe]) })).toThrow()
    expect(() => checkClientParity(native, {})).toThrow()
  })
})
