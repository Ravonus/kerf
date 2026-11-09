// mediaFfmpeg() for weft.config.ts: provides media.encode@1 for the video and audio keys. It runs an
// ffmpeg you installed, or the one `binary` names (with `sha256`, refused unless the file matches). weft ships no ffmpeg:
// builds with x264/x265 are GPL, and H.264, HEVC and AAC fall under patent pools, so that choice stays with the app.
import { fileURLToPath } from 'node:url'
import { definePlugin, defineSlot, provide } from '@weft-js/core/plugin'

const mediaEncode = defineSlot({
  id: 'media.encode',
  version: 1,
  cardinality: 'keyed',
  sides: ['build', 'server'],
})
export const KEYS = [
  'video/av1',
  'video/vp9',
  'video/hevc',
  'video/h264',
  'audio/opus',
  'audio/aac',
]

const fail = (path, message) => {
  throw Object.assign(new Error(message), { path })
}

function options(input) {
  for (const key of Object.keys(input))
    if (!['binary', 'probe', 'sha256', 'timeout'].includes(key)) fail(key, 'unknown option')
  const { binary = 'system', probe, sha256, timeout = 600_000 } = input
  if (typeof binary !== 'string') fail('binary', "'system' for the ffmpeg on PATH, or a path")
  if (probe !== undefined && typeof probe !== 'string') fail('probe', 'the path of ffprobe')
  if (sha256 !== undefined && !/^[0-9a-f]{64}$/.test(sha256))
    fail('sha256', 'the 64 hex digits of the binary')
  if (sha256 && binary === 'system')
    fail('sha256', 'needs `binary`: a PATH lookup has no one file to pin')
  if (!(Number.isInteger(timeout) && timeout > 0)) fail('timeout', 'milliseconds per encode')
  return { binary, ...(probe && { probe }), ...(sha256 && { sha256 }), timeout }
}

export const mediaFfmpeg = definePlugin({
  name: '@weft-js/plugin-media-ffmpeg',
  version: '0.1.0',
  weft: '*',
  namespace: 'M',
  options,
  permissions: {
    fs: {
      read: ['**/*.{gif,mp4,m4v,mov,webm,mkv,ogv,mp3,wav,flac,ogg,oga,opus,m4a,aac}'],
      write: ['$TMPDIR/weft-ffmpeg-*'],
    },
    spawn: ['ffmpeg', 'ffprobe'],
  },
  contribute: (o) => ({
    provides: KEYS.map((key) =>
      provide(mediaEncode, {
        key,
        sides: {
          build: {
            module: fileURLToPath(new URL('./build.mjs', import.meta.url)),
            export: 'createMediaEncode',
            options: { ...o, key },
          },
          server: {
            module: '@weft-js/plugin-media-ffmpeg/build',
            export: 'createMediaEncode',
            options: { ...o, key },
          },
        },
      }),
    ),
    agents: {
      title: 'Video and audio (@weft-js/plugin-media-ffmpeg)',
      text: [
        '- GIFs, videos and audio files are `?media` imports rendered with `<Media>`. Never hand-write `<video>` or `<source>`.',
        '- Sync code to them with `timeline(asset, { cues })` from `@weft-js/core/media` and `<Media timeline={t}>`, not `timeupdate` listeners.',
        '- `./loop.gif?media&audio=./beat.opus` muxes the audio into the video at build.',
      ].join('\n'),
    },
    catalog: [
      {
        name: 'timeline',
        import: '@weft-js/core/media',
        summary:
          'timeline(asset, { cues }): currentTime and playing as boxes, cues on presented frames',
      },
    ],
    notes: [
      'ffmpeg is not installed by weft. Builds with x264/x265 are GPL; distributing one can bind what you ship with it.',
      'H.264, HEVC and AAC encoders fall under patent pools (Via LA, Access Advance). AV1, VP9 and Opus are royalty-free.',
    ],
  }),
})
