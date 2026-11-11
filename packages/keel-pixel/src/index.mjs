// KEEL's renderer stays behind the slot's `import()` so only pages that mount it load it.
import { definePlugin, defineSlot, provide } from '@kerf-js/core/plugin'

const renderer = defineSlot({
  id: 'surface.renderer',
  version: 1,
  cardinality: 'keyed',
  sides: ['client'],
})

export const keel = definePlugin({
  name: '@kerf-js/keel-pixel',
  version: '0.1.0',
  kerf: '*',
  namespace: 'surface-keel/',
  contribute: () => ({
    provides: [
      provide(renderer, {
        key: 'keel-pixel',
        sides: { client: { module: '@kerf-js/keel-pixel/runtime', export: 'renderer' } },
      }),
    ],
    agents: {
      title: 'KEEL surfaces (@kerf-js/keel-pixel)',
      text: "- `kind: 'keel-pixel'` needs `pixel: { width, height }`. `s.px` is KEEL's `PixelRenderer`: `setPalette`, `setMaterials`, `setWorld`, `render`. Palettes come from `recipeTheme()` in `@kerf-js/keel-pixel/theme`.",
    },
    catalog: [
      {
        name: 'keel',
        import: '@kerf-js/keel-pixel',
        summary: 'surface.renderer: keel-pixel',
      },
    ],
  }),
})
