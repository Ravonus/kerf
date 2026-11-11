# @weft-js/plugin-keel

KEEL generation for weft. It adds the `keel-lit` surface kind, a lit WebGL2 scene with physically based
materials and soft shadows, and ships KEEL's generators as modules that load only where a page uses them.
Nothing is an authored asset: trees are grown from a seed, light is the sun's for a place and hour, and
music is scored from a seed.

```ts
// weft.config.ts
import { defineConfig } from '@weft-js/core/config'
import { keel } from '@weft-js/plugin-keel'

export default defineConfig({ plugins: [keel()] })
```

```tsx
import { defineSurface, Surface } from '@weft-js/core/surface'
import { keelStage } from '@weft-js/plugin-keel/stage'

export const Grove = defineSurface<{}, 'keel-lit'>({
  name: 'grove',
  kind: 'keel-lit',
  setup(s) {
    let draw = () => {}
    void keelStage(s, { prefer: 'realism' }).then(async (stage) => {
      const growth = await import(
        '@weft-js/plugin-keel/modules/tree-growth'
      )
      const { createTreeRender } = await import(
        '@weft-js/plugin-keel/modules/tree-render'
      )
      const model = growth.growTree({ species: 'oak', seed: 42 })
      const tree = createTreeRender(s.lit as never, model, {
        colors,
        ground: { y: 0, radius: 4 },
      })
      stage.scene.add(tree.group)
      stage.camera.position.set(0, 4, 14)
      stage.camera.lookAt(0, 3, 0)
      const year = growth.yearState({ species: 'oak', day: 170 })
      const pose = growth.treeFrame(model, model.cycles * 0.8)
      draw = () => {
        const elapsed = s.clock.seconds
        tree.update(pose, year, { elapsed, delta: 0, wind: 0.3 })
        stage.render()
      }
      s.invalidate()
    })
    s.frame(() => draw())
  },
})
```

## The surface kind

`kind: 'keel-lit'` gives `setup` two fields:

- `s.lit`: the keel/lit namespace. `Stage`, `Group`, `Mesh`, `Instances`, `PerspectiveCamera`, `SunLight`,
  `SkyLight`, `LitMaterial`, `ToonMaterial`, `CustomMaterial`, geometry functions (`box()`, `sphere()`,
  `plane()`, `lathe()`, `extrude()` and more), render targets, fog, and environment light:
  `stage.environment = new Environment(STUDIO, { size: 128 })`, a generated studio with no file.
- `s.renderer`: its renderer, bound to the surface's canvas and sized with it.

The surface's own rules still hold: the server renders a sized placeholder, an off-screen surface skips its
paints, and under `prefers-reduced-motion: reduce` the clock starts paused on one still frame.

## A stage with a look

`keelStage(s, options)` from `@weft-js/plugin-keel/stage` sets up what most scenes need and draws them through
one look recipe (`keel-look@1`):

| | |
| --- | --- |
| `stage.scene`, `stage.camera`, `stage.sun`, `stage.sky` | Add to the scene; move the camera and lights. |
| `stage.setLook('realism' \| 'pixel', recipe?)` | The same scene in lit full colour (ambient occlusion, haze, bloom, a tone map and grade) or dithered pixel art. Each pass loads the first time its look is used. |
| `stage.light(worldLight(...))` | Sun, sky fill, background and air from `world-light`'s answer. |
| `stage.look` | What the look asks of generators: `density`, `trees`, `kind`. |
| `stage.render()` | Draws a frame. Call it inside `s.frame`. |

## Modules

Each is `@weft-js/plugin-keel/modules/<id>`, typed, and its own file: import it with `import()` and a page
that never reaches that line never downloads it.

| Module | What it makes |
| --- | --- |
| `tree-growth` | A tree grown from a species and a seed, posed for any age and day of the year. |
| `tree-render` | Draws that tree, or a forest of them with levels of detail and impostor cards. |
| `world-light` | The sun, moon, sky colours, fog and haze of a place and instant. |
| `look` | Resolves a `keel-look@1` recipe for a target. |
| `voxel-dither` | The dithered pixel look: palettes, screens, outlines, cel light. |
| `lit-finish` | The realism look: ambient occlusion, aerial haze, light through leaves, TAA, bloom, tone map, grade. |
| `band` | A seeded generative band in eight styles on plain Web Audio, layered by an energy dial. |
| `quality`, `device-profile` | Detail levels by device, a frame-time governor, and the page levers a scene spends. |
| `tracks` | Keyed tracks sampled at a position, eased by cubic-bezier handles. |
| `camera-rail` | A camera on keyed tracks, with pointer pan and tilt. |
| `scene-blend` | A hand-over between two lit scenes: line work and a seeded noise or radial reveal, or a plain fade. |
| `section-post` | A section's pass after the finish: a paper panel with a straight or torn edge, darkening, blur and grain. |
| `motes` | Dust, light motes and sparkles on one instanced quad, drifting and blinking on the page's clock. |
| `butterflies` | A small flock of glowing butterflies with Shape wings, wandering on a seed and the page's clock. |
| `plate-painter` | A painted landscape plate from a seeded recipe, generated on the GPU and drawn behind a scene. |
| `portrait` | A seeded waist-up portrait bust at hero detail, sculpted and meshed when generated, with soft portrait light. |

`vendor/modules/<id>.inputs.json` lists the settings a module offers a host, as `keel-module-inputs@1`.

## Scrubbing a scene

`@weft-js/scroll/timeline` reads keyframe tracks at a position and follows a section's scroll progress:

```ts
import { progress, timeline } from '@weft-js/scroll/timeline'

const tracks = timeline({
  z: [[0, 54], [1, 8]],
  fov: [[0, 34], [1, 50]],
})
const scrub = progress(section, { onChange: () => s.invalidate() })
s.frame(() => {
  const at = tracks.at(scrub.value)
  stage.camera.position.set(0, 3, at.z)
})
```

## Scenes on a stage

`defineScene` from `@weft-js/plugin-keel/scene` declares one section's scene for warp's `<Stage>` and `<Scene>`
(`@weft-js/warp/scenes`), which share one canvas across the page:

```ts
import { defineScene } from '@weft-js/plugin-keel/scene'

export const orchard = defineScene({
  tracks: [
    {
      target: 'camera',
      property: 'eye',
      keys: [[0, [0, 2, 9]], [2, [3, 2, 5]]],
    },
    { target: 'tree', property: 'sway', keys: [[0, 0], [2, 1]] },
  ],
  build({ lit }) {
    const stage = new lit.Stage()
    const camera = new lit.PerspectiveCamera(40, 1, 0.1, 100)
    const tree = new lit.Group()
    stage.add(tree, new lit.SkyLight('#fff', '#443', 1))
    return { stage, camera, tree }
  },
  at(position, frame, values) {
    this.tree.rotation.z = 0.1 * Number(values.tree?.sway ?? 0)
  },
})
```

The stage builds a scene when its section comes near and frees it two scenes away. Tracks that key a `camera`
target drive the camera through `camera-rail`; `at` gets the other sampled values, with `this` the object
`build` returned. A scene also takes `modules` (loaded before `build`), `setQuality(levers)`, `render()` for a
finish of its own and `dispose()`; the stage's meshes, materials and textures are freed for it. `hold` (a position, or
`'first'` or `'last'` for its tracks' first or last key) is where it stands under reduced motion and on a low tier,
where `keelGovernor()` holds scenes still.

`keelGovernor()` from `@weft-js/plugin-keel/governor` is the stage's governor: `device-profile` picks the
tier, the tier the fps cap (30 on low) and the widest canvas (3840, 1920 or 1280 px), and `quality` the level,
its page levers (`quality.levers`) and a render scale it lowers while frames run slow:
`<Stage governor={keelGovernor()}>`.

`keelBlend()` from `@weft-js/plugin-keel/blend` is the stage's blend: `<Stage blend={keelBlend()}>`. Every scene
is drawn through `lit-finish`. A hand-over goes through `scene-blend`: the incoming scene arrives as line work
and fills in through seeded noise, or out from its `<Scene centre>` with `mode="radial"`, and the less visible
scene is drawn by a lighter finish at the levers' `blendScale`. The active section's pass goes through
`section-post`: a paper panel with a straight or torn edge, and darkening and blur, from `<Scene post>` or from
tracks on a `post` target:

```ts
tracks: [
  {
    target: 'post',
    property: 'progress',
    keys: [[1, 0], [2, 1], [3, 2]],
  },
  { target: 'post', property: 'tear', keys: [[0, 1]] },
]
```

`keelBlend({ finish, blend, post })` passes settings to each module: `blend: { seed: 7, lineColour: '#ffffff' }`.

## Music

```ts
const { createBand, scoreOf } = await import(
  '@weft-js/plugin-keel/modules/band'
)
// From a click: browsers start audio only from a gesture.
const band = createBand(new AudioContext())
band.start(scoreOf({ seed: 'grove', style: 'dream' }))
band.setEnergy(0.4) // fewer parts
```

Styles: `ambient`, `lofi`, `synthwave`, `chiptune`, `house`, `cinematic`, `folk`, `dream`. `scoreOf` and
`eventsAt` are pure, so a visual can read what plays at any sixteenth note and move with it.

## The demo

`demo/` is a pinned grove scrubbed by the scroll: the camera flies in while spring turns to autumn and
morning to evening, in either look, with the band joining in as you go deeper. `demo/stage.html` is three sections over one
stage, each with a scene of its own, blending into the next as its section arrives, with a straight-edged paper
panel over the second scene and a torn one over the third. `stage.html?measure` times every frame drawn. Its
posters are baked from the scenes themselves with `@weft-js/capture`, and a phone gets only them, with no renderer
loaded.

```bash
node test/serve.mjs 4179
```

`pnpm run test:e2e` runs it in Chrome on the GPU and checks its pixels. It also bakes the stage's posters,
rebuilds with them, and captures the stage at three scroll stops.

## Vendored code

`vendor/` is generated by `scripts/vendor.mjs` from pinned commits of keel-engine and keel-modules (both MIT)
and is held to `vendor/lock.json`. keel/lit ports Three.js r180 (MIT); see `vendor/NOTICE`.
