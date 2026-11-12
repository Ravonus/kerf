// Three sections over one pinned canvas: each brings its own scene, and the next blends in as its section arrives. A
// paper panel with a straight edge crosses the second scene, and one with a torn edge the third. Each poster is
// baked from its own scene (`kerf capture bake`); a phone gets the posters and no renderer.
/// <reference types="@kerf-js/capture/posters" />
import 'virtual:kerf/posters'
import { render } from '@kerf-js/core/dom'
import { clock, type SurfaceBase, type SurfaceContext } from '@kerf-js/core/surface'
import { keelBlend } from '@kerf-js/keel/blend'
import { keelGovernor } from '@kerf-js/keel/governor'
import type { BlendOptions, LiveScene } from '@kerf-js/keel/scene'
import { Scene, Stage, type ActiveScene } from '@kerf-js/veneer/scenes'
import { blocks, built, orrery, rings } from './scenes'
import './stage.css'

const governor = keelGovernor()
const query = new URLSearchParams(location.search)
// `?column` keeps the paper panels to the middle half, as a page whose own panel is a column would.
const blend = keelBlend({
  blend: { seed: 7 },
  ...(query.has('column') && { inset: (width: number) => [width / 4, width / 4] as const }),
})
/** Each drawn frame's time in ms, the GPU's included, kept with `?measure`: hand-overs apart from single scenes. */
const timings = { blended: [] as number[], alone: [] as number[] }
const measuring = query.has('measure')
/**
 * What the e2e test reads: where the page stands, which scenes are built, and the last hand-over drawn.
 */
const stageDemo = {
  active: null as ActiveScene | null,
  built,
  governor,
  handover: null as { t: number; mode: string; lines: boolean } | null,
  timings,
}

/** The stage's blend, telling the page what it draws and, when measuring, how long each frame takes. */
async function watched(surface: SurfaceBase) {
  const made = await blend(surface)
  const gl = (surface as SurfaceContext<'keel-lit'>).renderer.getContext()
  const pixel = new Uint8Array(4)
  return {
    ...made,
    draw(a: LiveScene, b: LiveScene, t: number, options: BlendOptions) {
      const start = performance.now()
      made.draw(a, b, t, options)
      if (a !== b) stageDemo.handover = { t, mode: options.mode, lines: options.lines }
      if (!measuring) return
      // Reading a pixel waits for the GPU to finish the frame.
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
      timings[a === b ? 'alone' : 'blended'].push(performance.now() - start)
    },
  }
}

/** The second section's panel: a straight edge sweeping up over the scene and off its top. */
const straight = (position: number) => ({
  progress: Math.min(2, Math.max(0, (position - 0.9) / 0.6)),
  tear: 0,
  colour: '#f2efe4',
  darken: 0.25,
})

function StagePage() {
  return (
    <Stage
      label="Three generated scenes"
      governor={governor}
      blend={watched}
      tier="auto"
      onActive={(a) => (stageDemo.active = a)}
    >
      <Scene id="orrery" use={orrery} class="chapter" poster="bake" label="Orrery">
        <div class="panel">
          <h1>Orrery</h1>
          <p>Gold spheres round a dark one, lit by a studio that is generated, not loaded.</p>
        </div>
      </Scene>
      <Scene
        id="rings"
        use={rings}
        class="chapter"
        poster="bake"
        label="Rings"
        mode="radial"
        centre={{ x: 0.3, y: 0.2 }}
        post={straight}
      >
        <div class="panel">
          <h2>Rings</h2>
          <p>
            Seven rings on one axis, arriving as line work out from a point. A sheet of paper with a
            straight edge passes over them.
          </p>
        </div>
      </Scene>
      <Scene id="blocks" use={blocks} class="chapter" poster="bake" label="Blocks">
        <div class="panel">
          <h2>Blocks</h2>
          <p>
            Eighty-one blocks in one instanced draw, under a torn sheet its own tracks move. The
            first scene is freed by now.
          </p>
        </div>
      </Scene>
    </Stage>
  )
}

render(() => <StagePage />, document.getElementById('app')!)
Object.assign(window, { clock, stageDemo })
