import { describe, expect, it } from 'vitest'
import { pin } from '../scripts/tarballs.mjs'

describe('pin', () => {
  it("points kerf dependencies at tarballs and keeps the app's own overrides", () => {
    const tarballs = {
      '@kerf/core': 'file:/x/kerf.tgz',
      '@kerf/cli': 'file:/x/cli.tgz',
      'create-kerf': 'file:/x/cw.tgz',
    }
    const pkg = pin(
      {
        dependencies: { '@kerf/core': '0.0.0', zod: '4.6.7' },
        devDependencies: { '@kerf/cli': '0.0.0' },
        overrides: { zod: '4.6.7' },
      },
      tarballs,
    )
    expect(pkg.dependencies).toEqual({ '@kerf/core': 'file:/x/kerf.tgz', zod: '4.6.7' })
    expect(pkg.devDependencies).toEqual({ '@kerf/cli': 'file:/x/cli.tgz' })
    expect(pkg.overrides).toEqual({ zod: '4.6.7', ...tarballs })
  })
})
