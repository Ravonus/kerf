// A thread of `keelPaint`'s pool: plans and paints one recipe on the CPU and answers with its PNG's bytes.
import { parentPort } from 'node:worker_threads'
import { recipeOf } from './paint-recipe.mjs'
import { png } from './paint.mjs'

const surfaces = await import('../vendor/modules/surfaces.mjs')

parentPort?.on('message', (request) => {
  try {
    const { recipe, settings } = recipeOf(request, surfaces)
    const surface = surfaces.paintPlan(surfaces.planSurface(recipe, settings))
    // A copy that owns its whole buffer: a Node Buffer may be a slice of a shared pool, which cannot be moved.
    const bytes = new Uint8Array(
      png(new Uint8Array(surface.buffers[0]), surface.width, surface.height),
    )
    parentPort?.postMessage({ bytes, width: surface.width, height: surface.height }, [bytes.buffer])
  } catch (error) {
    parentPort?.postMessage({ error: error?.message ?? String(error) })
  }
})
