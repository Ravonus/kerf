import { describe, expect, it } from 'vitest'
import { pin } from '../scripts/tarballs.mjs'

describe('pin', () => {
  it("points weft dependencies at tarballs and keeps the app's own overrides", () => {
    const tarballs = {
      '@weft-js/core': 'file:/x/weft.tgz',
      '@weft-js/cli': 'file:/x/cli.tgz',
      '@weft-js/create': 'file:/x/cw.tgz',
    }
    const pkg = pin(
      {
        dependencies: { '@weft-js/core': '0.0.0', zod: '4.6.7' },
        devDependencies: { '@weft-js/cli': '0.0.0' },
        overrides: { zod: '4.6.7' },
      },
      tarballs,
    )
    expect(pkg.dependencies).toEqual({ '@weft-js/core': 'file:/x/weft.tgz', zod: '4.6.7' })
    expect(pkg.devDependencies).toEqual({ '@weft-js/cli': 'file:/x/cli.tgz' })
    expect(pkg.overrides).toEqual({ zod: '4.6.7', ...tarballs })
  })
})
