import type { PluginInstance } from '@weft-js/core/plugin'

/* THEME_TYPES */

/** For `site.head`: restores `setDial(…, { persist: true })` before the first paint. */
export const dialScript: string

/** The dials supported by both configuration forms. */
interface WarpDials {
  expression?: 'quiet' | 'balanced' | 'vivid'
  density?: 'compact' | 'cozy' | 'comfortable'
  flair?: 'sweep' | 'none'
  theme?: 'light' | 'dark'
}

/** Options shared by the base and named-palette configurations. */
interface WarpCommonOptions {
  /** System overrides are not yet supported; an empty dictionary is accepted. */
  system?: Record<string, never>
  /** Named hex colours or aliases to other named colours. */
  colors?: Record<string, string>
  /** 'classic' makes classic fields the default. */
  fields?: 'floating' | 'classic'
  /** Replaces the radius each expression sets. */
  radius?: 'sharp' | 'soft' | 'round'
  /** A family name, or a full CSS font stack. */
  fonts?: { body?: string; display?: string; mono?: string }
}

/** What warp() takes: base options or the bounded named-palette form. */
export type WarpOptions = WarpCommonOptions &
  (
    | {
        /** No named palettes; an empty dictionary is accepted. */
        themes?: Record<string, never>
        /** Resting Button colours are supported together; empty dictionaries are accepted. */
        parts?: { button?: { bg?: never; text?: never } | { bg: string; text: string } }
        /**
         * The brand's hue family: `{ accent: '#rrggbb' }`, or a hue and chroma. Each theme solves its own lightness, and the build
         * prints where it landed. `neutral` tints pages, surfaces and text the same way. Checked at the stops `dials` leave (D010).
         */
        seed?: ({ accent: string } | { hue: number; chroma: number } | {}) & {
          neutral?: string | { hue: number; chroma: number }
        }
        /** Any spec token, like `{ '--warp-color-page': '#fafafa' }`. Checked at the stops `dials` leave (D010). */
        tokens?: Record<`--warp-${string}`, string>
        /** The app's default dials. A `data-*` on `<html>` or any scope still wins. */
        dials?: WarpDials & { palette?: never }
      }
    | {
        /** Named palettes may replace configured named hex colours. */
        themes?: Record<string, { colors?: Record<string, string> }>
        /** Only empty root overrides are supported with named palettes. */
        parts?: Record<string, never>
        seed?: Record<string, never>
        tokens?: Record<string, never>
        /** Auto removes the attribute and follows the configured default; default selects the base. */
        dials?: WarpDials & { palette?: string }
      }
  )

/** The Vite plugin that serves warp's tokens for an app. */
export const warp: (options?: WarpOptions) => PluginInstance<unknown>
/** The plugin, for `import warp from`. */
export default warp
