// keel() for weft.config.ts (PLAN §5, research 33 §5): the `keel-pixel` surface kind. KEEL's renderer is ~27 KB br, so it
// stays behind the slot's `import()` and only pages that mount a `keel-pixel` surface load it.
import { definePlugin, defineSlot, provide } from 'weft/plugin'

const renderer = defineSlot({ id: 'surface.renderer', version: 1, cardinality: 'keyed', sides: ['client'] })

export const keel = definePlugin({
  name: '@weft/plugin-surface-keel',
  version: '0.0.0',
  weft: '*',
  namespace: 'surface-keel/',
  contribute: () => ({
    provides: [provide(renderer, { key: 'keel-pixel', sides: { client: { module: '@weft/plugin-surface-keel/runtime', export: 'renderer' } } })],
    agents: {
      title: 'KEEL surfaces (@weft/plugin-surface-keel)',
      text: "- `kind: 'keel-pixel'` needs `pixel: { width, height }`. `s.px` is KEEL's `PixelRenderer`: `setPalette`, `setMaterials`, `setWorld`, `render`. Palettes come from `recipeTheme()` in `@weft/plugin-surface-keel/theme`.",
    },
    catalog: [{ name: 'keel', import: '@weft/plugin-surface-keel', summary: 'surface.renderer: keel-pixel' }],
  }),
})
