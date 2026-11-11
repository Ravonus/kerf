// The run-time path for a surface that can't be painted at build: a themed colour, a visitor's seed. Opt in with
// `paintLive(recipe)`: it paints on a WebGL2 `OffscreenCanvas` (or on the CPU without one), encodes the albedo to a
// blob and gives a media record whose `src` is its blob URL. Same recipe, same picture as `?paint`.
import type { MediaAsset } from '@kerf-js/core/media'
import { recipeOf, type PaintRecipe } from './paint-recipe.mjs'
import type { Surface, SurfacePlan } from '../vendor/modules/surfaces.mjs'
import type * as SurfacesModule from '../vendor/modules/surfaces.mjs'

export type { PaintRecipe }

/** A record painted in this page: `<Media src={asset}>`; `revoke()` frees its blob once nothing shows it. */
export type LiveAsset = MediaAsset & { readonly digest: string; revoke(): void }

const painted = new Map<string, Promise<LiveAsset>>()

type Surfaces = typeof SurfacesModule

/** Paints a plan on a WebGL2 `OffscreenCanvas`, or on the CPU where there is none. */
function paint(surfaces: Surfaces, plan: SurfacePlan): Surface {
  const gl = new OffscreenCanvas(1, 1).getContext('webgl2')
  if (!gl) return surfaces.paintPlan(plan)
  const painter = surfaces.createSurfacePainter(gl)
  try {
    return painter.paintPlan(plan)
  } finally {
    painter.dispose()
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}

async function encode(surface: Surface, request: PaintRecipe): Promise<LiveAsset> {
  const { width, height, digest } = surface
  const canvas = new OffscreenCanvas(width, height)
  const pixels = new Uint8ClampedArray(surface.buffers[0])
  canvas.getContext('2d')!.putImageData(new ImageData(pixels, width, height), 0, 0)
  const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.9 })
  const src = URL.createObjectURL(blob)
  return {
    kind: 'graphic',
    src,
    width,
    height,
    type: blob.type,
    sources: [],
    name: `${request.surface ?? request.recipe?.kind ?? 'surface'}-${request.seed ?? 0}`,
    quality: 'original',
    digest,
    revoke() {
      URL.revokeObjectURL(src)
      painted.delete(digest)
    },
  }
}

/**
 * Paints a surface in the page, once per digest while it is kept: `<Media src={await paintLive(recipe)} alt="" decorative />`.
 * Needs `OffscreenCanvas`; WebGL2 makes it quick, the CPU path takes a second or two at card size.
 */
export async function paintLive(request: PaintRecipe): Promise<LiveAsset> {
  const surfaces = await import('../vendor/modules/surfaces.mjs')
  const { recipe, settings } = recipeOf(request, surfaces)
  const plan = surfaces.planSurface(recipe, settings)
  let asset = painted.get(plan.digest)
  if (!asset) painted.set(plan.digest, (asset = encode(paint(surfaces, plan), request)))
  return asset
}

/** A record as a CSS image: an `image-set` of each format's widest file, for a tile under `background-repeat`. */
export function cssImage(asset: MediaAsset): string {
  const widest = (srcset: string) => srcset.split(',').at(-1)!.trim().split(/\s+/)[0]!
  const sets = asset.sources.map((s) => `url("${widest(s.srcset)}") type("${s.type}")`)
  return sets.length ? `image-set(${sets.join(', ')})` : `url("${asset.src}")`
}
