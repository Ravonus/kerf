// A painted plate at a frame's size: planned, painted on a WebGL2 `OffscreenCanvas` and read back as pixels.
import {
  coverCrop,
  createPlatePainter,
  LAKE_VALLEY,
  planPlate,
  type BackdropView,
  type PlatePainter,
  type PlatePlan,
  type PlateRecipe,
  type PlateSettings,
  type PlateView,
} from '../../vendor/modules/plate-painter.mjs'

/** What to paint: a recipe (the module's own by default) and settings, at a size, of the crop that covers it. */
export interface PlateJob {
  readonly recipe?: PlateRecipe
  readonly settings?: PlateSettings
  readonly width: number
  readonly height: number
  /** The plate's part to paint; default the crop covering `width` × `height`, placed by `cover`. */
  readonly view?: PlateView
  readonly cover?: Omit<BackdropView, 'width' | 'height'>
}

/** The plate's pixels, rows from the top: `new lit.DataTexture(data, width, height)`. */
export interface PlateResult {
  readonly digest: string
  readonly width: number
  readonly height: number
  readonly view: PlateView
  readonly data: Uint8ClampedArray
}

const plans = new Map<string, PlatePlan>()
let painter: PlatePainter | undefined

export function run(job: PlateJob): PlateResult {
  const recipe = job.recipe ?? LAKE_VALLEY
  const key = JSON.stringify([recipe, job.settings ?? {}])
  let plan = plans.get(key)
  if (!plan) plans.set(key, (plan = planPlate(recipe, job.settings)))
  const gl = painter ? null : new OffscreenCanvas(1, 1).getContext('webgl2')
  if (!painter && !gl) throw new Error('keel generate: plates need WebGL2 on an OffscreenCanvas')
  painter ??= createPlatePainter(gl!)
  const view = job.view ?? coverCrop(plan.aspect, job.width / job.height, job.cover)
  const plate = painter.paint(plan, { width: job.width, height: job.height, view })
  const still = painter.read(plate)
  painter.release(plate)
  return { digest: plate.digest, width: still.width, height: still.height, view, data: still.data }
}
