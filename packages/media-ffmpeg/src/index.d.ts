import type { PluginInstance } from '@kerf/core/plugin'

/** Options of `mediaFfmpeg()`: which ffmpeg to run, and how far to trust it. */
export interface MediaFfmpegOptions {
  /** 'system' (the default) runs `ffmpeg` and `ffprobe` from PATH; otherwise the path of ffmpeg. */
  binary?: string
  /** The path of ffprobe, when `binary` is a path. Default: `ffprobe` next to it. */
  probe?: string
  /** SHA-256 of `binary`: an encode is refused unless the file matches. */
  sha256?: string
  /** Milliseconds one ffmpeg run may take. Default 10 minutes. */
  timeout?: number
}

/** The media.encode@1 keys this plugin provides, one per codec. */
export declare const KEYS: string[]
/** The plugin for `kerf.config.ts`: encodes video and audio with ffmpeg for `@kerf/media`. */
export declare function mediaFfmpeg(
  options?: MediaFfmpegOptions,
): PluginInstance<MediaFfmpegOptions>
