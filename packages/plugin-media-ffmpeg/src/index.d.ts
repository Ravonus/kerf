import type { PluginInstance } from 'weft/plugin'

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

export declare const KEYS: string[]
export declare function mediaFfmpeg(options?: MediaFfmpegOptions): PluginInstance<MediaFfmpegOptions>
