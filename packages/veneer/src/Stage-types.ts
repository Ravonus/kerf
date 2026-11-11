// The shapes a scene stage and its scenes agree on. A renderer's bridge (keel's `defineScene`) fills them;
// the stage needs nothing else from it, so veneer imports no renderer.
import type { SurfaceBase } from '@kerf-js/core/surface'
import type { MediaAsset } from '@kerf-js/core/media'
import type { Handover, Levers } from '@kerf-js/veneer-core/scenes'

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

/** A scene the stage can build: `defineScene(...)` from @kerf-js/keel. */
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
  /** The device's tier once `start` resolved. A stage with `tier="auto"` shows posters on `low`. */
  readonly tier?: 'high' | 'mid' | 'low'
}

/** Where the page stands, written once per frame when it moves. */
export interface ActiveScene extends Handover {
  /** The active scene's position, in viewports. */
  readonly position: number
}

/** `<Stage>`'s props. */
export interface StageProps {
  /** What the scenes show, for assistive tech. */
  label: string
  /** The surface kind the scenes draw on. Default `keel-lit`. */
  kind?: string
  /** Device tier, render scale, pixel ratio and fps cap. Without one: full levers, 60 fps, ratio up to 2. */
  governor?: StageGovernor
  /** The hand-over blend, made once the surface is up. Without one the stage cuts at the switch. */
  blend?: (surface: SurfaceBase) => StageBlend | Promise<StageBlend>
  /** Called when the active scene, its position or the hand-over moves. */
  onActive?: (active: ActiveScene) => void
  /** Called when the scroll has settled and the scenes it wants have drawn: the frame a capture may take. */
  onReady?: (active: ActiveScene) => void
  /**
   * `live` draws the scenes. `poster` shows only their posters and never loads a renderer. `auto` shows posters
   * on a phone or tablet and where the governor rates the device `low`, decided before any renderer loads.
   * Default `live`.
   */
  tier?: 'live' | 'poster' | 'auto'
  class?: string
  children?: unknown
}

/** `<Scene>`'s props. */
export interface SceneProps extends SceneLook {
  use: StageSceneDef
  /**
   * Shown until the scene draws, and where it can't: a colour, an image URL, a baked poster, or `bake` for the
   * one `bakedPosters` holds under this scene's `id`.
   */
  poster?: string | ScenePoster
  /** How many viewports the blend into this scene lasts. Default 1. */
  hero?: number
  /** How many viewports before the section enters its position starts. Default 0.2. */
  early?: number
  seed?: number
  id?: string
  class?: string
  label?: string
  children?: unknown
}

/** A still of a scene for wide screens, and one for tall ones: what a poster bake writes, as media records. */
export interface ScenePoster {
  readonly desktop: MediaAsset
  readonly mobile?: MediaAsset
}

/** A scene as a driver outside the page sees it. */
export interface StageSceneInfo {
  readonly index: number
  readonly id: string | null
  /** Its poster is `bake`. */
  readonly bake: boolean
  /** Its position when its section's top meets the viewport's top: where a baked poster is drawn without a hold. */
  readonly rest: number
}

/** What a stage offers a driver outside the page, such as a capture harness or a poster bake: `root[STAGE]`. */
export interface StageHandle {
  /** `live` draws scenes, `poster` shows only posters; null until `tier="auto"` decides. */
  readonly tier: 'live' | 'poster' | null
  /** Every scene, in page order. */
  scenes(): StageSceneInfo[]
  /** Stops the shared clock at `seconds` and turns TAA off, so the same scroll draws the same frame. */
  freeze(seconds: number): void
  /**
   * Draws scene `index` alone at `position` with the clock at `seconds`; resolves with a PNG data URL. Without a
   * position it stands where its poster is drawn: its `hold`, else its `rest`.
   */
  still(index: number, position?: number, seconds?: number): Promise<string>
}
