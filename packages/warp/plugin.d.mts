import type { PluginInstance } from 'weft/plugin'

export interface WarpOptions {
  /** The brand accent: `{ accent: '#rrggbb' }`, or a hue and chroma. Checked against every dial stop (D010). */
  seed?: { accent: string } | { hue: number; chroma: number }
  /** `'classic'` makes classic fields the default. */
  fields?: 'floating' | 'classic'
}

export const warp: (options?: WarpOptions) => PluginInstance<unknown>
export default warp
