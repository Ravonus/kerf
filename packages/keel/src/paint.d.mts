import type { Plugin } from 'vite'

export type { PaintRecipe } from './paint-recipe.mjs'

/** Options for `keelPaint`. */
export interface KeelPaintOptions {
  /** Where painted PNGs are kept, keyed by the plan's digest. Default `<root>/.kerf/cache/paint`. */
  readonly cacheDir?: string
}

/** The Vite plugin for `import ground from './card.paint.json?paint'`: a media record of a surface painted at build. */
export declare function keelPaint(options?: KeelPaintOptions): Plugin

/** The painted PNG for a recipe file, from the cache or painted now. */
export declare function paintFile(
  file: string,
  cacheDir: string,
  log?: (line: string) => void,
): Promise<{ file: string; painted: boolean }>

/** RGBA rows as an unfiltered PNG. */
export declare function png(rgba: Uint8Array, width: number, height: number): Buffer
