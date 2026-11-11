// KEEL's renderer and modules stay behind `import()`: only a page that mounts a `keel-lit` surface loads them.
import { definePlugin, defineSlot, provide } from '@kerf-js/core/plugin'

const renderer = defineSlot({
  id: 'surface.renderer',
  version: 1,
  cardinality: 'keyed',
  sides: ['client'],
})

/** The KEEL modules this package ships, each loaded on its own: `@kerf-js/keel/modules/<id>`. */
export const MODULES = [
  'band',
  'butterflies',
  'camera-rail',
  'device-profile',
  'lit-finish',
  'look',
  'motes',
  'plate-painter',
  'portrait',
  'quality',
  'scene-blend',
  'section-post',
  'surfaces',
  'tracks',
  'tree-growth',
  'tree-render',
  'voxel-dither',
  'world-light',
]

export const keel = definePlugin({
  name: '@kerf-js/keel',
  version: '0.1.4',
  kerf: '*',
  namespace: 'keel/',
  contribute: () => ({
    provides: [
      provide(renderer, {
        key: 'keel-lit',
        sides: { client: { module: '@kerf-js/keel/runtime', export: 'renderer' } },
      }),
    ],
    agents: {
      title: 'KEEL generation (@kerf-js/keel)',
      text: [
        "- `kind: 'keel-lit'`: `s.lit` is keel/lit (WebGL2 scene graph, PBR, soft shadows), `s.renderer` its renderer.",
        "- `keelStage(s, { prefer: 'realism' | 'pixel' })` from `@kerf-js/keel/stage` gives `scene`, `camera`, `sun`, `sky`, `setLook()`, `light()` and `render()`. Call `stage.render()` inside `s.frame`.",
        '- Generators load lazily: `await import("@kerf-js/keel/modules/tree-growth")` (also tree-render, world-light, quality, device-profile, tracks, camera-rail, scene-blend, section-post, motes, butterflies, plate-painter, portrait, surfaces). Same seed, same result.',
        '- Music: `createBand(audioContext)` and `scoreOf({ seed, style })` from `@kerf-js/keel/modules/band` (ambient, lofi, synthwave, chiptune, house, cinematic, folk, dream). `band.setEnergy(0..1)` layers parts. Start it from a click.',
        '- Scrub a scene with `timeline()` and `progress()` from `@kerf-js/scroll/timeline`.',
      ].join('\n'),
    },
    catalog: [
      {
        name: 'keel',
        import: '@kerf-js/keel',
        summary: 'surface.renderer: keel-lit; KEEL generators (trees, looks, light)',
      },
    ],
  }),
})
