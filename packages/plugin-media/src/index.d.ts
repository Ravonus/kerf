import type { PluginInstance } from 'weft/plugin'

export interface MediaOptions {
  /** Efficient formats in front of the source-format fallback. Default `['avif']`. */
  formats?: ('avif' | 'webp')[]
  /** The width ladder; the largest also caps the output. Default 320, 640, 960, 1280, 1920, 2560. */
  widths?: number[]
  /** `target`: the SSIMULACRA2 score each format is searched to (default 80). `scorer`: the command, or 'none'. */
  quality?: { target?: number; scorer?: string }
  /** Dominant colour and a 16 px WebP placeholder. Default true. */
  placeholder?: boolean
  /** Bytes over which a GIF is M004. Default 256 KB. */
  gifLimit?: number
}

export declare function media(options?: MediaOptions): PluginInstance<MediaOptions>
