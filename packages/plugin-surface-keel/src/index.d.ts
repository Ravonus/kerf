import type { PluginEntry } from '@weft-js/core/config'
import type { Palette, PixelRenderer } from './vendor-types'

/** The plugin for `weft.config.ts`: adds the `keel-pixel` surface kind and KEEL's theme. */
export declare const keel: () => PluginEntry

/** `{ seed, culture, pins }` → KEEL's theme: palette ramps, frame, type, spacing and motion. */
export declare function recipeTheme(recipe?: { seed?: string; culture?: string; pins?: Record<string, unknown> }): { key: string; palette: Palette; [k: string]: unknown }
/** A theme as `--keel-*` CSS variables at an integer scale. */
export declare function themeTokens(theme: unknown, scale?: number): Record<string, string>

declare module '@weft-js/core/surface' {
  interface SurfaceKinds {
    /** `s.px`: KEEL's PixelRenderer. */
    'keel-pixel': { px: PixelRenderer }
  }
}
