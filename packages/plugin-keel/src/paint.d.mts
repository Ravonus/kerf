import type { Plugin } from 'vite'

import type { PaintRecipe } from './paint-recipe.mjs'

export type { PaintRecipe }

/** Options for `keelPaint`. */
export interface KeelPaintOptions {
  /** Where painted PNGs are kept, keyed by the plan's digest. Default `<root>/.weft/cache/paint`. */
  readonly cacheDir?: string
  /** How many recipes paint at once, each on a thread of its own. Default one fewer than the cores, up to 4; 0 paints
   * on Vite's thread. */
  readonly threads?: number
}

/** Threads that paint recipes side by side. */
export interface PaintPool {
  paint(request: PaintRecipe): Promise<{ bytes: Uint8Array; width: number; height: number }>
  close(): Promise<void>
}

/** A pool of up to `size` painting threads, started as they are needed. */
export declare function createPaintPool(size?: number): PaintPool

/** The Vite plugin for `import ground from './card.paint.json?paint'`: a media record of a surface painted at build. */
export declare function keelPaint(options?: KeelPaintOptions): Plugin

/** The painted PNG for a recipe file, from the cache or painted now. */
export declare function paintFile(
  file: string,
  cacheDir: string,
  log?: (line: string) => void,
  pool?: PaintPool | null,
): Promise<{ file: string; painted: boolean }>

/** RGBA rows as an unfiltered RGB PNG (the alpha left out). */
export declare function png(rgba: Uint8Array, width: number, height: number): Buffer
