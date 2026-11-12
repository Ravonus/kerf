// A surface's albedo and relief: on a WebGL2 `OffscreenCanvas` where there is one, else on the CPU. Same pixels.
import { recipeOf, type PaintRecipe } from '../paint-recipe.mjs'
import * as surfaces from '../../vendor/modules/surfaces.mjs'

let painter: surfaces.SurfacePainter | null | undefined

export function run(request: PaintRecipe): surfaces.Surface {
  const { recipe, settings } = recipeOf(request, surfaces)
  const plan = surfaces.planSurface(recipe, settings)
  if (painter === undefined) {
    const gl =
      typeof OffscreenCanvas === 'undefined' ? null : new OffscreenCanvas(1, 1).getContext('webgl2')
    painter = gl && surfaces.createSurfacePainter(gl)
  }
  return painter ? painter.paintPlan(plan) : surfaces.paintPlan(plan)
}
