import type { PluginInstance } from '@weft-js/core/plugin'
import type {
  WarpDials,
  ButtonLayout,
  TabsState,
  LinkState,
  PillState,
  SweepState,
  WarpCommonOptions,
} from './src/theme-config.mjs'

/* THEME_TYPES */

/** For `site.head`: restores `setDial(…, { persist: true })` before the first paint. */
export const dialScript: string

/** What warp() takes: base options or the bounded named-palette form. */
export type WarpOptions = WarpCommonOptions &
  (
    | {
        /** No named palettes; an empty dictionary is accepted. */
        themes?: Record<string, never>
        /** Resting Button colours are supported together; empty dictionaries are accepted. */
        parts?: {
          button?: ButtonLayout & ({ bg?: never; text?: never } | { bg: string; text: string })
          sweep?: SweepState & { hover?: SweepState; press?: SweepState; active?: SweepState }
          nav?: {
            gap?: number | string
            paddingBlock?: number | string
            duration?: number | string
            underline?: { width?: number | string }
            hover?: { gap?: number | string }
            active?: { gap?: number | string }
          }
          tabs?: TabsState & {
            gap?: number | string
            duration?: number | string
            underline?: { width?: number | string }
            hover?: TabsState
            active?: TabsState
          }
          link?: LinkState & {
            duration?: number | string
            underline?: { width?: number | string; offset?: number | string }
            hover?: LinkState
            press?: LinkState
          }
          pill?: PillState & { hover?: PillState; active?: PillState }
          field?: {
            gap?: number | string
            radius?: number | string
            height?: number | string
            paddingInline?: number | string
            font?: { family?: string; size?: number | string; weight?: number }
            shadow?: string
            duration?: number | string
            hover?: { gap?: number | string; shadow?: string }
          }
          card?: {
            gap?: number | string
            padding?: number | string
            radius?: number | string
            shadow?: string
            hover?: {
              gap?: number | string
              padding?: number | string
              radius?: number | string
              shadow?: string
            }
          }
        }
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
        /** A root seed applies to every named palette. */
        seed?: ({ accent: string } | { hue: number; chroma: number } | {}) & {
          neutral?: string | { hue: number; chroma: number }
        }
        tokens?: Record<string, never>
        /** Auto removes the attribute and follows the configured default; default selects the base. */
        dials?: WarpDials & { palette?: string }
      }
  )

/** The Vite plugin that serves warp's tokens for an app. */
export const warp: (options?: WarpOptions) => PluginInstance<unknown>
/** The plugin, for `import warp from`. */
export default warp
