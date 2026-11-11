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

/** A built scene. */
export interface StageScene {
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

/** How a hand-over looks. */
export interface BlendOptions {
  readonly mode: 'noise' | 'radial' | 'fade'
  readonly pointer: StagePointer | null
  /** False under reduced motion: a plain dissolve, no line work. */
  readonly lines: boolean
}

/** Draws two scenes as one during a hand-over. Without one the stage cuts at `t` = 0.5. */
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
  /** The highest pixel ratio for a canvas `width` CSS px wide, before the render scale. */
  pixelRatio(width: number): number
}

/** Where the page stands, written once per frame when it moves. */
export interface ActiveScene extends Handover {
  /** The active scene's position, in viewports. */
  readonly position: number
}
