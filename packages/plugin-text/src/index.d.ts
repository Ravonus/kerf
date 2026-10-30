import type { PluginInstance } from 'weft/plugin'

export interface Face {
  family: string
  /** The font file, relative to the project root (woff2, woff, ttf or otf). */
  src: string
  /** The system face the fallback is matched to: Arial, Helvetica, Times New Roman, Georgia, Courier New, Verdana… */
  fallback: string
  /** Never `block` or `auto` (X021). Default `swap`. */
  display?: 'swap' | 'optional' | 'fallback'
  weight?: number
  style?: 'normal' | 'italic'
  /** Variable axes kept in the subset: `{ wght: [400, 700] }` sets the face's weight range. */
  axes?: Record<string, [number, number]>
  /** Preload the latin subset. Default: true for `body` and `display`. */
  preload?: boolean
}

export type Subset = 'latin' | 'latin-ext' | 'cyrillic' | 'cyrillic-ext' | 'greek' | 'greek-ext' | 'vietnamese'

export interface TextOptions {
  /** Role → face. The only place font files are declared. */
  fonts?: Record<string, Face>
  /** Default `['latin']`. */
  subsets?: Subset[]
  /** `text.measure` arrives with Surfaces; only `'off'` for now. */
  measure?: 'off'
}

export declare const SUBSETS: Subset[]
export declare function text(options?: TextOptions): PluginInstance<Required<TextOptions>>
