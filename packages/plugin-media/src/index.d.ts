import type { PluginInstance } from '@weft-js/core/plugin'

/** Options of `media()`: what to encode, how far to search, and when the encoding happens. */
export interface MediaOptions {
  /** Efficient formats in front of the source-format fallback. Default `['avif']`. */
  formats?: ('avif' | 'webp')[]
  /** The width ladder; the largest also caps the output. Default 320, 640, 960, 1280, 1920, 2560. */
  widths?: number[]
  /** `target`: the SSIMULACRA2 score each format is searched to (default 80). `scorer`: the command, or 'none'. */
  quality?: { target?: number; scorer?: string }
  /**
   * Dominant colour and a 16 px WebP placeholder. `true` or 'inline' (the default) inlines it as a `data:` URL; 'file'
   * writes it as its own file, for a CSP whose `img-src` has no `data:`; `false` leaves both out.
   */
  placeholder?: boolean | 'inline' | 'file'
  /** Bytes over which a GIF is M004. Default 256 KB. */
  gifLimit?: number
  /** 'server': `?media` imports are encoded on first request by the media route, not at build. 'compatible': the page shows the efficient file, and a compatible copy swaps in so saving gives a file that opens anywhere. Default 'off'. */
  encoder?: 'off' | 'compatible' | 'server'
  /** When a compatible copy swaps in, with `encoder: 'compatible'`. Default 'intent': on right-click, long-press or drag. */
  swap?: 'intent' | 'idle' | 'never'
  /** Efficient codecs next to H.264 (default `['av1']`), and the ladder (default 640, 960, 1280, 1920). */
  video?: { codecs?: ('av1' | 'vp9' | 'hevc')[]; widths?: number[] }
  /** `toVideo: 'never'` keeps GIFs. `keepUnder`: bytes under which a GIF stays one. Default 8 KB. */
  gif?: { toVideo?: 'auto' | 'never'; keepUnder?: number }
  /** The media route's store (uploads, and `encoder: 'server'`). `dir` default `.weft/media`, `maxBytes` default 20 MB. */
  server?: { dir?: string; maxBytes?: number }
}

/** The plugin for `weft.config.ts`: `?media` imports become optimised, responsive assets. */
export declare function media(options?: MediaOptions): PluginInstance<MediaOptions>
