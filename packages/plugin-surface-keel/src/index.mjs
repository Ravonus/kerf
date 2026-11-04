// keel() for weft.config.ts (PLAN §5, research 33 §5): the `keel-pixel` surface kind. KEEL's renderer is ~27 KB br, so it
// stays behind the slot's `import()` and only pages that mount a `keel-pixel` surface load it.
import { definePlugin, defineSlot, provide } from '@weft-js/core/plugin'

const renderer = defineSlot({
  id: 'surface.renderer',
  version: 1,
  cardinality: 'keyed',
  sides: ['client'],
})

export const keel = definePlugin({
  name: '@weft-js/plugin-surface-keel',
  version: '0.1.0',
  weft: '*',
  namespace: 'surface-keel/',
  contribute: () => ({
    provides: [
      provide(renderer, {
        key: 'keel-pixel',
        sides: { client: { module: '@weft-js/plugin-surface-keel/runtime', export: 'renderer' } },
      }),
    ],
    agents: {
      title: 'KEEL surfaces (@weft-js/plugin-surface-keel)',
      text: "- `kind: 'keel-pixel'` needs `pixel: { width, height }`. `s.px` is KEEL's `PixelRenderer`: `setPalette`, `setMaterials`, `setWorld`, `render`. Palettes come from `recipeTheme()` in `@weft-js/plugin-surface-keel/theme`.",
    },
    catalog: [
      {
        name: 'keel',
        import: '@weft-js/plugin-surface-keel',
        summary: 'surface.renderer: keel-pixel',
      },
    ],
  }),
})
