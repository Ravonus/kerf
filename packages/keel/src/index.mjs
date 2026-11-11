// KEEL's renderer and modules stay behind `import()`: only a page that mounts a `keel-lit` surface loads them.
import { definePlugin, defineSlot, provide } from '@kerf/core/plugin'

const renderer = defineSlot({
  id: 'surface.renderer',
  version: 1,
  cardinality: 'keyed',
  sides: ['client'],
})

/** The KEEL modules this package ships, each loaded on its own: `@kerf/keel/modules/<id>`. */
export const MODULES = [
  'band',
  'device-profile',
  'lit-finish',
  'look',
  'quality',
  'tree-growth',
  'tree-render',
  'voxel-dither',
  'world-light',
]

export const keel = definePlugin({
  name: '@kerf/keel',
  version: '0.1.4',
  kerf: '*',
  namespace: 'keel/',
  contribute: () => ({
    provides: [
      provide(renderer, {
        key: 'keel-lit',
        sides: { client: { module: '@kerf/keel/runtime', export: 'renderer' } },
      }),
    ],
    agents: {
      title: 'KEEL generation (@kerf/keel)',
      text: [
        "- `kind: 'keel-lit'`: `s.lit` is keel/lit (WebGL2 scene graph, PBR, soft shadows), `s.renderer` its renderer.",
        "- `keelStage(s, { prefer: 'realism' | 'pixel' })` from `@kerf/keel/stage` gives `scene`, `camera`, `sun`, `sky`, `setLook()`, `light()` and `render()`. Call `stage.render()` inside `s.frame`.",
        '- Generators load lazily: `await import("@kerf/keel/modules/tree-growth")` (also tree-render, world-light, quality, device-profile). Same seed, same result.',
        '- Music: `createBand(audioContext)` and `scoreOf({ seed, style })` from `@kerf/keel/modules/band` (ambient, lofi, synthwave, chiptune, house, cinematic, folk, dream). `band.setEnergy(0..1)` layers parts. Start it from a click.',
        '- Scrub a scene with `timeline()` and `progress()` from `@kerf/scroll/timeline`.',
      ].join('\n'),
    },
    catalog: [
      {
        name: 'keel',
        import: '@kerf/keel',
        summary: 'surface.renderer: keel-lit; KEEL generators (trees, looks, light)',
      },
    ],
  }),
})
