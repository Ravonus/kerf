// The scene contract: one section's scene, built on a page's shared `keel-lit` surface and driven by position.
// The page decides when a scene is built, where it stands and what it may spend; the scene only answers.
import type { SurfaceContext } from '@weft-js/core/surface'
import type { LitCamera, LitNode, LitStage } from './lit'
import type { RailOptions } from '../vendor/modules/camera-rail.mjs'
import type { Levers } from '../vendor/modules/quality.mjs'
import type { Sampled, Track } from '../vendor/modules/tracks.mjs'
import type * as Band from '../vendor/modules/band.mjs'
import type * as CameraRail from '../vendor/modules/camera-rail.mjs'
import type * as DeviceProfile from '../vendor/modules/device-profile.mjs'
import type * as LitFinish from '../vendor/modules/lit-finish.mjs'
import type * as Look from '../vendor/modules/look.mjs'
import type * as Quality from '../vendor/modules/quality.mjs'
import type * as SceneBlendModule from '../vendor/modules/scene-blend.mjs'
import type * as Tracks from '../vendor/modules/tracks.mjs'
import type * as TreeGrowth from '../vendor/modules/tree-growth.mjs'
import type * as TreeRender from '../vendor/modules/tree-render.mjs'
import type * as VoxelDither from '../vendor/modules/voxel-dither.mjs'
import type * as WorldLight from '../vendor/modules/world-light.mjs'

/** The modules a scene can ask for, each loaded once, when the first scene that names it is built. */
export interface KeelModules {
  band: typeof Band
  'camera-rail': typeof CameraRail
  'device-profile': typeof DeviceProfile
  'lit-finish': typeof LitFinish
  look: typeof Look
  quality: typeof Quality
  'scene-blend': typeof SceneBlendModule
  tracks: typeof Tracks
  'tree-growth': typeof TreeGrowth
  'tree-render': typeof TreeRender
  'voxel-dither': typeof VoxelDither
  'world-light': typeof WorldLight
}
/** A module's id. */
export type ModuleId = keyof KeelModules

/** What a page lets its scenes spend: quality's page levers. The page owns them; a scene reads them in `setQuality`. */
export type { Levers }

/** What the page knows this frame. */
export interface SceneFrame {
  /** The pointer over the stage, each axis in -1..1 with y up; null when it is away. */
  readonly pointer: { readonly x: number; readonly y: number } | null
  /** How fast the position moves, in units per second; 0 at rest. */
  readonly velocity: number
  /** The page's clock in seconds. It stands still under reduced motion. */
  readonly time: number
}

/** A scene built on the stage's surface, ready to draw. */
export interface LiveScene {
  readonly stage: LitStage
  readonly camera: LitCamera
  /** Poses the scene at `position`, in viewports since its section began to enter (1 ≈ one viewport). */
  at(position: number, frame: SceneFrame): void
  setQuality(levers: Levers): void
  /** Draws it to whatever the renderer targets. */
  render(): void
  /** Frees its geometry, materials and textures. */
  dispose(): void
}

/** What the page hands a scene to build on. */
export interface SceneHost {
  readonly surface: SurfaceContext<'keel-lit'>
  readonly seed: number
  readonly quality: Levers
}

/** Draws two scenes as one while the page hands over from `a` to `b`; `t` runs 0 to 1. */
export interface SceneBlend {
  draw(a: LiveScene, b: LiveScene, t: number, options: BlendOptions): void
  dispose?(): void
}
/** How a hand-over looks. `lines: false` under reduced motion: a plain dissolve. */
export interface BlendOptions {
  readonly mode: 'noise' | 'radial' | 'fade'
  readonly pointer: { readonly x: number; readonly y: number } | null
  readonly lines: boolean
}

/** What `build` gets: the host's surface, seed and levers, the scene's modules, and a sampler for its tracks. */
export interface SceneContext<M extends ModuleId> extends SceneHost {
  readonly lit: SurfaceContext<'keel-lit'>['lit']
  readonly renderer: SurfaceContext<'keel-lit'>['renderer']
  readonly modules: Pick<KeelModules, M>
  /** The scene's tracks at a position (and a time, for tracks driven by the clock). */
  sample(position: number, time?: number): Sampled
}

/** What `build` returns: the scene root and camera, and anything the hooks need, reached there as `this`. */
export interface Built {
  readonly stage: LitStage
  readonly camera: LitCamera
}

/** A scene as its author writes it. */
export interface SceneSpec<M extends ModuleId, B extends Built> {
  /** Loaded before `build`. `tracks`, and `camera-rail` when the tracks key a camera, come on their own. */
  readonly modules?: readonly M[]
  /** Keyed tracks in sequence units. A `camera` target drives the camera through `camera-rail`. */
  readonly tracks?: readonly Track[]
  /** The rail's pointer pan and tilt, default fov and path. */
  readonly rail?: Omit<RailOptions<readonly Track[]>, 'tracks'>
  build(ctx: SceneContext<M>): B | Promise<B>
  /** After the rail: anything else the position moves. `values` are the tracks sampled there. */
  at?(this: B, position: number, frame: SceneFrame, values: Sampled): void
  setQuality?(this: B, levers: Levers): void
  /** Draws through a finish of its own. Default: the renderer draws `stage` with `camera`. */
  render?(this: B): void
  /** Frees what the default does not: the stage's meshes are freed for it. */
  dispose?(this: B): void
}

/** A scene a page can build: what `defineScene` returns. */
export interface SceneDef {
  /** Fetches its modules, so a build later is quick. Safe to call again. */
  load(): Promise<void>
  build(host: SceneHost): Promise<LiveScene>
}

const LOAD: { [K in ModuleId]: () => Promise<KeelModules[K]> } = {
  band: () => import('../vendor/modules/band.mjs'),
  'camera-rail': () => import('../vendor/modules/camera-rail.mjs'),
  'device-profile': () => import('../vendor/modules/device-profile.mjs'),
  'lit-finish': () => import('../vendor/modules/lit-finish.mjs'),
  look: () => import('../vendor/modules/look.mjs'),
  quality: () => import('../vendor/modules/quality.mjs'),
  'scene-blend': () => import('../vendor/modules/scene-blend.mjs'),
  tracks: () => import('../vendor/modules/tracks.mjs'),
  'tree-growth': () => import('../vendor/modules/tree-growth.mjs'),
  'tree-render': () => import('../vendor/modules/tree-render.mjs'),
  'voxel-dither': () => import('../vendor/modules/voxel-dither.mjs'),
  'world-light': () => import('../vendor/modules/world-light.mjs'),
}

type Freeable = { dispose?: () => void; isTexture?: boolean }

/** Frees every geometry, material and material texture under `root`. */
export function disposeTree(root: LitNode) {
  root.traverse((node) => {
    const { geometry, material } = node as { geometry?: Freeable; material?: Freeable | Freeable[] }
    geometry?.dispose?.()
    for (const m of ([] as Freeable[]).concat(material ?? [])) {
      for (const value of Object.values(m) as unknown[])
        if ((value as Freeable | null)?.isTexture) (value as Freeable).dispose?.()
      m.dispose?.()
    }
  })
}

async function loadAll(ids: readonly ModuleId[]) {
  const loaded = await Promise.all(ids.map((id) => LOAD[id]()))
  return Object.fromEntries(ids.map((id, i) => [id, loaded[i]])) as Partial<KeelModules>
}

/**
 * Declares a section's scene: `defineScene({ tracks, build(ctx) { ... return { stage, camera } } })`.
 * The page builds it when its section comes near, poses it with `at` each frame and disposes it when far.
 */
export function defineScene<M extends ModuleId = never, B extends Built = Built>(
  spec: SceneSpec<M, B>,
): SceneDef {
  const tracks = spec.tracks ?? []
  const rides = tracks.some((track) => track.target === (spec.rail?.name ?? 'camera'))
  const ids = [
    ...new Set<ModuleId>([
      ...(spec.modules ?? []),
      'tracks',
      ...(rides ? ['camera-rail' as const] : []),
    ]),
  ]
  let loading: Promise<Partial<KeelModules>> | undefined
  const load = () => (loading ??= loadAll(ids))
  return {
    load: async () => void (await load()),
    async build(host) {
      const modules = await load()
      const { sampleTracks } = modules.tracks!
      const { lit, renderer } = host.surface
      const sample = (position: number, time?: number) => sampleTracks(tracks, position, time)
      const ctx = { ...host, lit, renderer, modules: modules as Pick<KeelModules, M>, sample }
      const built = await spec.build(ctx)
      const rail = rides
        ? modules['camera-rail']!.createCameraRail(sampleTracks, { ...spec.rail, tracks })
        : null
      const apply = modules['camera-rail']?.applyView
      let aspect = 0
      // The stage's surface resizes under the scene: its camera follows the canvas's shape.
      const fit = () => {
        const { width, height } = host.surface.size.value
        if (!width || !height || width / height === aspect) return
        aspect = width / height
        built.camera.aspect = aspect
        built.camera.updateProjectionMatrix()
      }
      return {
        stage: built.stage,
        camera: built.camera,
        at(position, frame) {
          if (rail && apply) apply(built.camera, rail.at(position, frame))
          spec.at?.call(built, position, frame, sample(position, frame.time))
        },
        setQuality: (levers) => spec.setQuality?.call(built, levers),
        render() {
          fit()
          if (spec.render) spec.render.call(built)
          else renderer.render(built.stage, built.camera)
        },
        dispose() {
          spec.dispose?.call(built)
          disposeTree(built.stage)
        },
      }
    },
  }
}
