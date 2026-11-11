import { describe, expect, it } from 'vitest'
import { pin } from '../scripts/tarballs.mjs'

describe('pin', () => {
  it("points kerf dependencies at tarballs and keeps the app's own overrides", () => {
    const tarballs = {
      '@kerf-js/core': 'file:/x/kerf.tgz',
      '@kerf-js/cli': 'file:/x/cli.tgz',
      'create-kerf': 'file:/x/cw.tgz',
    }
    const pkg = pin(
      {
        dependencies: { '@kerf-js/core': '0.0.0', zod: '4.6.7' },
        devDependencies: { '@kerf-js/cli': '0.0.0' },
        overrides: { zod: '4.6.7' },
      },
      tarballs,
    )
    expect(pkg.dependencies).toEqual({ '@kerf-js/core': 'file:/x/kerf.tgz', zod: '4.6.7' })
    expect(pkg.devDependencies).toEqual({ '@kerf-js/cli': 'file:/x/cli.tgz' })
    expect(pkg.overrides).toEqual({ zod: '4.6.7', ...tarballs })
  })
})
