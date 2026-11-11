import type { SurfaceRecipe, SurfaceSettings } from '../vendor/modules/surfaces.mjs'
import type * as Surfaces from '../vendor/modules/surfaces.mjs'

/** A painted surface by request: a preset or a whole recipe, a seed and a size in pixels. */
export interface PaintRecipe {
  /** One of the surfaces module's recipes: `paper` and `knit` tile, `painted-*` are card grounds. */
  readonly surface?: keyof typeof PRESETS
  /** Laid over the preset: `{ "ground": "#2f4f5a" }`. */
  readonly with?: Readonly<Record<string, unknown>>
  /** A whole recipe instead of a preset. */
  readonly recipe?: SurfaceRecipe
  /** A whole number from 0. Default 0. */
  readonly seed?: number
  /** Pixels, 1..4096. Default 1024; the height defaults to the width. */
  readonly width?: number
  readonly height?: number
}

export declare const PRESETS: {
  readonly paper: 'PAPER'
  readonly knit: 'KNIT'
  readonly 'painted-floral': 'PAINTED_FLORAL'
  readonly 'painted-cloth': 'PAINTED_CLOTH'
}

export declare function recipeOf(
  request: PaintRecipe,
  surfaces: typeof Surfaces,
): { recipe: SurfaceRecipe; settings: SurfaceSettings }
