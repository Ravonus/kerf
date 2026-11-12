// The run-time path for a surface that can't be painted at build: a themed colour, a visitor's seed. Opt in with
// `paintLive(recipe)`: `generate` paints it in a worker (on a WebGL2 `OffscreenCanvas`, or on the CPU without one),
// and this thread encodes the albedo to a blob and gives a media record whose `src` is its blob URL. Same recipe,
// same picture as `?paint`.
import type { MediaAsset } from '@kerf-js/core/media'
import type { Surface } from '../vendor/modules/surfaces.mjs'
import { forget, generate, keyOf } from './generate'
import type { PaintRecipe } from './paint-recipe.mjs'

export type { PaintRecipe }

/** A record painted in this page: `<Media src={asset}>`; `revoke()` frees its blob once nothing shows it. */
export type LiveAsset = MediaAsset & { readonly digest: string; revoke(): void }

const painted = new Map<string, Promise<LiveAsset>>()

async function encode(surface: Surface, request: PaintRecipe, key: string): Promise<LiveAsset> {
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
      painted.delete(key)
      forget('surface', request)
    },
  }
}

/**
 * Paints a surface off this thread, once per request while it is kept:
 * `<Media src={await paintLive(recipe)} alt="" decorative />`. Needs `OffscreenCanvas` to encode.
 */
export function paintLive(request: PaintRecipe): Promise<LiveAsset> {
  const key = keyOf('surface', request)
  let asset = painted.get(key)
  if (!asset) {
    painted.set(key, (asset = generate('surface', request).then((s) => encode(s, request, key))))
  }
  return asset
}

/** A record as a CSS image: an `image-set` of each format's widest file, for a tile under `background-image`. */
export function cssImage(asset: MediaAsset): string {
  const widest = (srcset: string) => srcset.split(',').at(-1)!.trim().split(/\s+/)[0]!
  const sets = asset.sources.map((s) => `url("${widest(s.srcset)}") type("${s.type}")`)
  return sets.length ? `image-set(${sets.join(', ')})` : `url("${asset.src}")`
}
