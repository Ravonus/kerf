import type { PluginInstance } from '@weft-js/core/plugin'

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
  /** `{ wght: [400, 700] }` sets the face's weight range. A custom axis named here is kept whatever the source sets. */
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
  /** `'auto'` provides `text.measure`, loaded lazily by what uses it; `'off'` leaves it unbound. */
  measure?: 'auto' | 'off'
  /** `'slim'` is @weft-js/text/engine; `'pretext'` is pinned upstream (33.9 KB br). */
  engine?: 'slim' | 'pretext'
  /** Pin the custom axes the source never varies and load uncommon latin characters on demand. Builds only. Default `true`. */
  trim?: boolean
}

export declare const SUBSETS: Subset[]
export declare function text(options?: TextOptions): PluginInstance<Required<TextOptions>>
