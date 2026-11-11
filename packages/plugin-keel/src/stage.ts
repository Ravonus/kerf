// One lit stage for a `keel-lit` surface: scene, camera, sun and sky, wearing a KEEL look recipe (keel-look@1).
// The same scene draws dithered or in lit full colour; only the recipe changes. Each pass loads when a look needs it.
import type { SurfaceContext } from '@weft-js/core/surface'
import type { LitCamera, LitLight, LitStage } from './lit'
import type { LitStageLook, LookRecipe } from '../vendor/modules/look.mjs'
import type { LitFinish } from '../vendor/modules/lit-finish.mjs'
import type { VoxelDither } from '../vendor/modules/voxel-dither.mjs'
import type { WorldLight } from '../vendor/modules/world-light.mjs'

/** Which of a recipe's two looks to draw. */
export type LookKind = 'pixel' | 'realism'

/** Options for `keelStage`. */
export interface KeelStageOptions {
  /** A keel-look@1 recipe. Default: the `smart` pixel style, and AgX realism with full ambient occlusion. */
  recipe?: LookRecipe
  /** The look to start in. Default `realism`. */
  prefer?: LookKind
  /** Vertical field of view, in degrees. Default 40. */
  fov?: number
  /** Half the width of the ground the sun's shadow covers, in world units. Default 24. */
  shadowReach?: number
}

/** A lit stage bound to one surface. */
export interface KeelStage {
  readonly scene: LitStage
  readonly camera: LitCamera
  readonly sun: LitLight
  readonly sky: LitLight
  /** What the current look asks of generators: `density`, `trees`, `kind`. */
  readonly look: LitStageLook
  /** The lit-finish pass while the look is realism, else null. Its `ditherOffset()` feeds a forest's fades. */
  readonly finish: LitFinish | null
  /** Switches look, loading its pass first. Resolves once the next frame will draw it. */
  setLook(prefer: LookKind, recipe?: LookRecipe): Promise<void>
  /** Lights the stage from world-light's answer: sun, sky fill, background and air. */
  light(world: WorldLight): void
  /** Draws one frame through the look. Call it inside `s.frame`. */
  render(): void
  dispose(): void
}

const RECIPE: LookRecipe = {
  format: 'keel-look@1',
  pixel: { style: 'smart' },
  realism: { tonemap: 'agx', exposure: 1.15, ao: 1, density: 2 },
}
const SUN_DISTANCE = 60

/** Realism outweighs the sky with the sun, so lit and shaded ground read apart and AO has ambient light to take. */
const KEY = { realism: { sun: 1.55, sky: 0.62 }, pixel: { sun: 1, sky: 1 } }

type Lit = SurfaceContext<'keel-lit'>['lit']
interface Rig {
  scene: LitStage
  camera: LitCamera
  sun: LitLight
  sky: LitLight
}
/** What the look in use draws with. */
interface Worn {
  look: LitStageLook
  dither: VoxelDither | null
  finish: LitFinish | null
}

function rigOf(lit: Lit, options: KeelStageOptions): Rig {
  const scene = new lit.Stage()
  const camera = new lit.PerspectiveCamera(options.fov ?? 40, 1, 0.05, 400)
  const sky = new lit.SkyLight('#ffffff', '#666666', 1.1)
  const sun = new lit.SunLight('#ffffff', 3)
  const reach = options.shadowReach ?? 24
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.bias = -0.0005
  Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach })
  sun.shadow.camera.far = SUN_DISTANCE * 2.5
  sun.shadow.camera.updateProjectionMatrix()
  sun.position.set(0.5 * SUN_DISTANCE, 0.8 * SUN_DISTANCE, 0.35 * SUN_DISTANCE)
  scene.add(sky, sun, sun.target)
  scene.background = new lit.Color('#c8d0d4')
  return { scene, camera, sun, sky }
}

function air(lit: Lit, { scene, sun, sky }: Rig, { look, finish }: Worn, world: WorldLight) {
  const key = KEY[look.kind]
  const [x, y, z] = world.sun.direction
  sun.position.set(x * SUN_DISTANCE, Math.max(y, 0.04) * SUN_DISTANCE, z * SUN_DISTANCE)
  sun.color.set(world.sun.color)
  sun.intensity = (world.sun.elevation > -1 ? world.sun.intensity : 0) * key.sun
  sky.color.set(world.fill.sky)
  sky.groundColor.set(world.fill.ground)
  sky.intensity = world.fill.intensity * key.sky
  scene.background = new lit.Color(world.sky.horizon)
  if (!finish) {
    scene.fog = new lit.Fog(world.fog.color, world.fog.near, world.fog.far)
    return
  }
  // world-light's fog is a pixel look's backdrop; real air only veils, by how hazy the hour is.
  const colour = new lit.Color(world.fog.color).lerp(sky.color, 0.33).toArray()
  const start = Math.max(8, world.fog.near * 0.8)
  finish.setHaze({ colour, density: 0.0015 + 0.02 * world.haze, start })
  scene.fog = null
}

function draw(s: SurfaceContext<'keel-lit'>, { scene, camera, sun }: Rig, worn: Worn) {
  if (worn.dither) {
    worn.dither.setTime(s.clock.seconds)
    worn.dither.render(scene, camera)
  } else if (worn.finish) {
    worn.finish.setSun(sun.position.toArray(), sun.color.toArray())
    worn.finish.render(scene, camera as never)
  } else s.renderer.render(scene, camera)
}

/**
 * Makes a stage on a `keel-lit` surface: `const stage = await keelStage(s)`, add to `stage.scene`, then
 * `s.frame(() => stage.render())`.
 */
export async function keelStage(
  s: SurfaceContext<'keel-lit'>,
  options: KeelStageOptions = {},
): Promise<KeelStage> {
  const { lit, renderer } = s
  const { LOOK_TARGETS, resolveLook, stageOfLook } = await import('../vendor/modules/look.mjs')
  const rig = rigOf(lit, options)
  const worn = { dither: null, finish: null } as Worn
  let recipe = options.recipe ?? RECIPE
  let sized = ''
  let world: WorldLight | null = null
  let turn = 0

  async function setLook(prefer: LookKind, next: LookRecipe = recipe) {
    const mine = ++turn
    const look = stageOfLook(resolveLook({ ...next, prefer }, LOOK_TARGETS.lit))
    const [d, f] = await Promise.all([
      look.dither ? import('../vendor/modules/voxel-dither.mjs') : null,
      look.finish ? import('../vendor/modules/lit-finish.mjs') : null,
    ])
    if (mine !== turn) return
    worn.dither?.dispose()
    worn.finish?.dispose()
    worn.dither = d ? d.createVoxelDither(lit as never, renderer as never, look.dither) : null
    worn.finish = f ? f.createLitFinish(lit as never, renderer as never, look.finish) : null
    worn.look = look
    renderer.toneMapping = worn.finish ? 'none' : (look.toneMapping ?? 'none')
    renderer.toneMappingExposure = look.exposure
    recipe = next
    sized = ''
    if (world) air(lit, rig, worn, world)
    s.invalidate()
  }

  function render() {
    const { width, height } = s.size.value
    const dpr = s.dpr.value
    if (!width || !height) return
    const key = `${width}x${height}@${dpr}`
    if (key !== sized) {
      sized = key
      rig.camera.aspect = width / height
      rig.camera.updateProjectionMatrix()
      worn.dither?.setSize(width, height, dpr)
      worn.finish?.setSize(width, height, dpr)
    }
    draw(s, rig, worn)
  }

  await setLook(options.prefer ?? 'realism')
  return {
    ...rig,
    get look() {
      return worn.look
    },
    get finish() {
      return worn.finish
    },
    setLook,
    light(next) {
      world = next
      air(lit, rig, worn, next)
      s.invalidate()
    },
    render,
    dispose() {
      turn++
      worn.dither?.dispose()
      worn.finish?.dispose()
    },
  }
}
