import type { PluginInstance } from 'weft/plugin'

/** For `site.head`: restores `setDial(…, { persist: true })` before the first paint. */
export const dialScript: string

export interface WarpOptions {
  /** The brand accent: `{ accent: '#rrggbb' }`, or a hue and chroma. Checked against every dial stop (D010). */
  seed?: { accent: string } | { hue: number; chroma: number }
  /** `'classic'` makes classic fields the default. */
  fields?: 'floating' | 'classic'
  /** The app's default dials. A `data-*` on `<html>` or any scope still wins. */
  dials?: {
    expression?: 'quiet' | 'balanced' | 'vivid'
    density?: 'compact' | 'cozy' | 'comfortable'
    flair?: 'sweep' | 'none'
    theme?: 'light' | 'dark'
  }
  /** Replaces the radius each expression sets. */
  radius?: 'sharp' | 'soft' | 'round'
  /** A family name, or a full CSS font stack. */
  fonts?: { body?: string; display?: string; mono?: string }
  /** Any spec token, like `{ '--warp-color-page': '#fafafa' }`. Checked at every dial stop (D010). */
  tokens?: Record<`--warp-${string}`, string>
}

export const warp: (options?: WarpOptions) => PluginInstance<unknown>
export default warp
