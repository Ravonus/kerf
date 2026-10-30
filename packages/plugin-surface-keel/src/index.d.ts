import type { Palette } from './vendor-types'

export declare const keel: () => { name: string; provides: unknown[] }

/** `{ seed, culture, pins }` → KEEL's theme: palette ramps, frame, type, spacing and motion. */
export declare function recipeTheme(recipe?: { seed?: string; culture?: string; pins?: Record<string, unknown> }): { key: string; palette: Palette; [k: string]: any }
/** A theme as `--keel-*` CSS variables at an integer scale. */
export declare function themeTokens(theme: unknown, scale?: number): Record<string, string>

declare module 'weft/surface' {
  interface SurfaceKinds {
    /** `s.px`: KEEL's PixelRenderer. */
    'keel-pixel': { px: any }
  }
}
