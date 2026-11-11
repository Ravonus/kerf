// The shapes a scene stage and its scenes agree on. A renderer's bridge (plugin-keel's `defineScene`) fills them;
// the stage needs nothing else from it, so warp imports no renderer.
import type { SurfaceBase } from '@weft-js/core/surface'
import type { Handover, Levers } from '@weft-js/warp-core/scenes'

export type { Handover, Levers }

/** A point on the stage, each axis in -1..1 with y up. */
export interface StagePointer {
  readonly x: number
  readonly y: number
}

/** What a scene is told each frame besides its position. */
export interface SceneFrame {
  /** Null while the pointer is off the page. */
  readonly pointer: StagePointer | null
  /** How fast the active scene's position moves, in viewports per second. */
  readonly velocity: number
  /** The shared clock in seconds; it stands still under reduced motion. */
  readonly time: number
}

/**
 * A section's pass over its scene, each value a plain number: a paper panel that sweeps up over the frame and off its
 * top with a straight or torn edge, and the darkening and blur of the frame under it.
 */
export interface StagePost {
  /** The sweep: 0 → 1 the panel's top edge rises over the frame, 1 → 2 its bottom edge follows; 0 and 2 nothing. */
  readonly progress?: number
  /** Moves both edges, in frame heights with y up, -1..1. */
  readonly position?: number
  /** 0 a straight edge, 1 a torn one. */
  readonly tear?: number
  /** The paper: `#rrggbb`, or display values 0..1. */
  readonly colour?: string | readonly [number, number, number]
  /** Darkens the frame under the panel, 0..1. */
  readonly darken?: number
  /** Blurs the frame under the panel, 0..1. */
  readonly blur?: number
}

/** How a `<Scene>` arrives and what lies over it while it is active. */
export interface SceneLook {
  /** How the hand-over into this scene looks. Default `noise`. */
  mode?: 'noise' | 'radial'
  /** Where a radial hand-over into this scene starts, -1..1 each way with y up. Default the frame's centre. */
  centre?: StagePointer
  /** False: the scene fills in without line work. */
  lines?: boolean
  /**
   * Under reduced motion, and where the governor holds (a low tier): the position the scene stands at, whatever the
   * scroll. Its scene's own `hold` otherwise.
   */
  hold?: number
  /** The section's pass while it is active: values, or values for its position. Its scene's tracks override them. */
  post?: StagePost | ((position: number) => StagePost)
}

/** A built scene. */
export interface StageScene {
  /** Where the scene stands when the page holds it still, unless its `<Scene hold>` says. */
  readonly hold?: number | undefined
  /** The section pass its own tracks gave at the last `at`, over the `<Scene post>` values; null without one. */
  readonly post?: StagePost | null
  at(position: number, frame: SceneFrame): void
  setQuality(levers: Levers): void
  render(): void
  dispose(): void
}

/** What a scene is built on: the stage's surface, the scene's seed and the levers in force. */
export interface SceneHost {
  readonly surface: SurfaceBase
  readonly seed: number
  readonly quality: Levers
}

/** A scene the stage can build: `defineScene(...)` from plugin-keel. */
export interface StageSceneDef {
  /** Fetches what `build` needs, ahead of time. */
  load?(): Promise<void>
  build(host: SceneHost): Promise<StageScene>
}

/** How a frame looks: the hand-over into the incoming scene, as its `<Scene>` asks, and the active section's pass. */
export interface BlendOptions {
  /** `fade` under reduced motion: a plain dissolve the stage times, 300 ms. */
  readonly mode: 'noise' | 'radial' | 'fade'
  readonly pointer: StagePointer | null
  /** A radial reveal's centre, -1..1 each way with y up; null for the frame's centre. */
  readonly centre: StagePointer | null
  /** False under reduced motion or when the scene asks: the incoming fills in without line work. */
  readonly lines: boolean
  /** The levers in force: the less visible scene is drawn at `blendScale`. */
  readonly levers: Levers
  /** The active section's pass, or null. */
  readonly post: StagePost | null
}

/**
 * Draws every frame once it is made: a hand-over from `a` to `b` at `t`, or one scene alone with `a` = `b` and `t` = 1,
 * with the active section's pass over it. Without one the stage draws each scene plainly and cuts at `t` = 0.5.
 */
export interface StageBlend {
  draw(a: StageScene, b: StageScene, t: number, options: BlendOptions): void
  dispose?(): void
}

/** The page's frame governor: device tier to levers, frame times to render scale, a pixel ratio and an fps cap. */
export interface StageGovernor {
  /** Reads the device. Until it resolves the stage draws at full levers, 60 fps and the device's ratio up to 2. */
  start(): Promise<void>
  /** Hands over the time between two drawn frames, in ms. */
  frame(ms: number): void
  /** The same object until a lever changes: the stage passes a new one to every scene. */
  readonly levers: Levers
  readonly fps: number
  /** True where scenes should stand still rather than move with the scroll: those with a `hold` stand there. */
  readonly hold?: boolean
  /** The highest pixel ratio for a canvas `width` CSS px wide, before the render scale. */
  pixelRatio(width: number): number
}

/** Where the page stands, written once per frame when it moves. */
export interface ActiveScene extends Handover {
  /** The active scene's position, in viewports. */
  readonly position: number
}
