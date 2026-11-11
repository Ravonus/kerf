import type { PluginInstance } from '@weft-js/core/plugin'

/** One font file and how it's used. */
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
  /**
   * Only these characters: one small file whose `unicode-range` leaves every other character to the next face in the
   * stack. For a face that draws a few letters, like a drop-cap initial: `glyphs: 'ABCR'`. Replaces `subsets`.
   * `{ selector }` reads them from the text of the elements it matches (`.class`, `[attr="value"]` or a tag) in a
   * build, and `first: true` from each one's first letter, as `::first-letter` draws it. Text the source holds only
   * as an expression keeps the face whole, and `.weft/fonts.json` says why.
   */
  glyphs?: string | { selector: string; first?: boolean }
}

/** A Unicode range the fonts are cut to. */
export type Subset =
  | 'latin'
  | 'latin-ext'
  | 'cyrillic'
  | 'cyrillic-ext'
  | 'greek'
  | 'greek-ext'
  | 'vietnamese'

/** Options of `text()`. */
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

/** Every subset the build can cut. */
export declare const SUBSETS: Subset[]
/** The plugin for `weft.config.ts`: fonts, their fallbacks and `text.measure`. */
export declare function text(options?: TextOptions): PluginInstance<Required<TextOptions>>
