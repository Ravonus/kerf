// KEEL's renderer and modules stay behind `import()`: only a page that mounts a `keel-lit` surface loads them.
import { definePlugin, defineSlot, provide } from '@weft-js/core/plugin'

const renderer = defineSlot({
  id: 'surface.renderer',
  version: 1,
  cardinality: 'keyed',
  sides: ['client'],
})

/** The KEEL modules this package ships, each loaded on its own: `@weft-js/plugin-keel/modules/<id>`. */
export const MODULES = [
  'band',
  'butterflies',
  'camera-rail',
  'device-profile',
  'lit-finish',
  'look',
  'motes',
  'quality',
  'scene-blend',
  'section-post',
  'tracks',
  'tree-growth',
  'tree-render',
  'voxel-dither',
  'world-light',
]

export const keel = definePlugin({
  name: '@weft-js/plugin-keel',
  version: '0.1.4',
  weft: '*',
  namespace: 'keel/',
  contribute: () => ({
    provides: [
      provide(renderer, {
        key: 'keel-lit',
        sides: { client: { module: '@weft-js/plugin-keel/runtime', export: 'renderer' } },
      }),
    ],
    agents: {
      title: 'KEEL generation (@weft-js/plugin-keel)',
      text: [
        "- `kind: 'keel-lit'`: `s.lit` is keel/lit (WebGL2 scene graph, PBR, soft shadows), `s.renderer` its renderer.",
        "- `keelStage(s, { prefer: 'realism' | 'pixel' })` from `@weft-js/plugin-keel/stage` gives `scene`, `camera`, `sun`, `sky`, `setLook()`, `light()` and `render()`. Call `stage.render()` inside `s.frame`.",
        '- Generators load lazily: `await import("@weft-js/plugin-keel/modules/tree-growth")` (also tree-render, world-light, quality, device-profile, tracks, camera-rail, scene-blend, section-post, motes, butterflies). Same seed, same result.',
        '- Music: `createBand(audioContext)` and `scoreOf({ seed, style })` from `@weft-js/plugin-keel/modules/band` (ambient, lofi, synthwave, chiptune, house, cinematic, folk, dream). `band.setEnergy(0..1)` layers parts. Start it from a click.',
        '- Scrub a scene with `timeline()` and `progress()` from `@weft-js/scroll/timeline`.',
      ].join('\n'),
    },
    catalog: [
      {
        name: 'keel',
        import: '@weft-js/plugin-keel',
        summary: 'surface.renderer: keel-lit; KEEL generators (trees, looks, light)',
      },
    ],
  }),
})
