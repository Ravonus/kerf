// The plugin's contract, without a browser: test/e2e.mjs renders it.
import { describe, expect, it } from 'vitest'
import { keel } from '../src/index.mjs'
import { recipeTheme, themeTokens } from '../src/theme.mjs'

describe('keel()', () => {
  it('provides the keel-pixel key of surface.renderer, loaded lazily', () => {
    const p = keel()
    expect(p.provides).toEqual([{ slot: 'surface.renderer', key: 'keel-pixel' }])
    const [ref] = p.contribute({ command: 'check', mode: 'development', root: '' }).provides!
    expect(ref!.sides.client).toEqual({
      module: '@weft-js/plugin-surface-keel/runtime',
      export: 'renderer',
    })
  })

  it('a recipe gives the same theme every time, and tokens at an integer scale', () => {
    const recipe = { seed: 'keel/react-demo', culture: 'clean' }
    expect(recipeTheme(recipe).key).toBe(recipeTheme(recipe).key)
    expect(themeTokens(recipeTheme(recipe), 2)['--keel-px']).toBe('2px')
  })
})
