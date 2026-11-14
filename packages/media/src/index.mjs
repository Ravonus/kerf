// media() for kerf.config.ts: provides media.build@1 (src/build.mjs,
// run by @kerf-js/core/vite for `?media` imports) and media.server@1 (src/server.mjs, the route for uploads and `encoder:
// 'server'`), and reports M001–M013 and M016 through its `check` hook (src/check.mjs).
import { fileURLToPath } from 'node:url'
import { definePlugin, defineSlot, provide } from '@kerf-js/core/plugin'
import { checkMedia } from './check.mjs'

const mediaBuild = defineSlot({
  id: 'media.build',
  version: 1,
  cardinality: 'one',
  sides: ['build'],
})
const mediaServer = defineSlot({
  id: 'media.server',
  version: 1,
  cardinality: 'one',
  sides: ['server'],
})
const FORMATS = ['avif', 'webp']
const CODECS = ['av1', 'vp9', 'hevc']

const fail = (path, message) => {
  throw Object.assign(new Error(message), { path })
}

function playbackOptions(input, out) {
  if (input.video !== undefined) {
    const { codecs, widths, delivery, chunkSeconds, maxFrameBytes } = input.video
    if (delivery !== undefined && !['auto', 'frames', 'video'].includes(delivery))
      fail('video.delivery', "'auto', 'frames' or 'video'")
    if (chunkSeconds !== undefined && !(chunkSeconds >= 0.25 && chunkSeconds <= 10))
      fail('video.chunkSeconds', 'between .25 and 10 seconds')
    if (maxFrameBytes !== undefined && !(Number.isSafeInteger(maxFrameBytes) && maxFrameBytes > 0))
      fail('video.maxFrameBytes', 'a positive byte budget')
    if (codecs !== undefined) {
      if (!Array.isArray(codecs)) fail('video.codecs', 'expected an array')
      for (const [i, c] of codecs.entries())
        if (!CODECS.includes(c))
          fail(`video.codecs.${i}`, `\`${c}\`: ${CODECS.join(', ')} (H.264 is always there)`)
    }
    if (
      widths !== undefined &&
      !(Array.isArray(widths) && widths.length && widths.every((w) => Number.isInteger(w) && w > 0))
    )
      fail('video.widths', 'expected positive integers')
    out.video = { ...input.video, ...(widths && { widths: [...widths].sort((a, b) => a - b) }) }
  }
  if (input.gif !== undefined) {
    const { toVideo, keepUnder } = input.gif
    if (toVideo !== undefined && !['auto', 'never'].includes(toVideo))
      fail('gif.toVideo', "'auto' or 'never'")
    if (keepUnder !== undefined && !(Number.isInteger(keepUnder) && keepUnder >= 0))
      fail('gif.keepUnder', 'a number of bytes')
    out.gif = input.gif
  }
  if (input.server !== undefined) {
    const { dir, maxBytes } = input.server
    if (dir !== undefined && typeof dir !== 'string')
      fail('server.dir', 'a directory, relative to the app')
    if (maxBytes !== undefined && !(Number.isInteger(maxBytes) && maxBytes > 0))
      fail('server.maxBytes', 'a positive number of bytes')
    out.server = input.server
  }
}

function options(input) {
  for (const key of Object.keys(input))
    if (
      ![
        'formats',
        'widths',
        'quality',
        'placeholder',
        'gifLimit',
        'encoder',
        'swap',
        'video',
        'gif',
        'server',
      ].includes(key)
    )
      fail(key, 'unknown option')
  const out = {}
  if (input.encoder !== undefined) {
    if (!['off', 'compatible', 'server'].includes(input.encoder))
      fail('encoder', `\`${input.encoder}\`: 'off', 'compatible' or 'server'`)
    out.encoder = input.encoder
  }
  if (input.swap !== undefined) {
    if (!['intent', 'idle', 'never', 'manual'].includes(input.swap))
      fail('swap', `\`${input.swap}\`: 'intent', 'idle', 'manual' or 'never'`)
    if (input.encoder !== 'compatible')
      fail('swap', "only means something with `encoder: 'compatible'`")
    out.swap = input.swap
  }
  playbackOptions(input, out)
  if (input.formats !== undefined) {
    if (!Array.isArray(input.formats)) fail('formats', 'expected an array')
    for (const [i, f] of input.formats.entries())
      if (!FORMATS.includes(f))
        fail(
          `formats.${i}`,
          `\`${f}\`: the efficient formats are ${FORMATS.join(', ')} (the fallback follows the source)`,
        )
    out.formats = input.formats
  }
  if (input.widths !== undefined) {
    if (
      !Array.isArray(input.widths) ||
      !input.widths.length ||
      !input.widths.every((w) => Number.isInteger(w) && w > 0)
    )
      fail('widths', 'expected positive integers')
    out.widths = [...input.widths].sort((a, b) => a - b)
  }
  if (input.quality !== undefined) {
    const { target = 80, scorer = 'ssimulacra2', lossless = false } = input.quality
    if (typeof lossless !== 'boolean') fail('quality.lossless', 'a boolean')
    if (!(target > 0 && target <= 100))
      fail(
        'quality.target',
        'an SSIMULACRA2 score, 1–100 (80 ≈ visually lossless at normal viewing)',
      )
    if (typeof scorer !== 'string')
      fail('quality.scorer', "the SSIMULACRA2 command, or 'none' for fixed qualities")
    out.quality = { target, scorer, lossless }
  }
  if (input.placeholder !== undefined) {
    if (![true, false, 'inline', 'file'].includes(input.placeholder))
      fail(
        'placeholder',
        "true or 'inline' (a data: URL), 'file' (its own file, for a strict CSP), or false",
      )
    out.placeholder = input.placeholder === 'inline' ? true : input.placeholder
  }
  if (input.gifLimit !== undefined) out.gifLimit = input.gifLimit
  return out
}

const CODES = [
  ['M001', 'Raw <img>/<video> without width/height or aspect-ratio'],
  ['M002', 'Image through ?url or a string path'],
  ['M003', 'Raw <img> file far wider than its slot'],
  ['M004', 'GIF over 256 KB rendered raw'],
  ['M005', '<video autoplay> without muted'],
  ['M006', '<video> without poster'],
  ['M007', 'Missing or meaningless alt'],
  ['M008', 'Likely LCP image loaded lazily'],
  ['M009', 'More than 2 priority media in a route'],
  ['M010', 'priority <Media> with no width or sizes'],
  ['M011', 'Endless motion with no pause control'],
  ['M012', 'Unsafe SVG used as an image'],
  ['M013', 'public/ file referenced by string'],
  ['M014', "What `encoder: 'compatible'` adds to the build"],
  ['M015', 'An HDR or over-8-bit source that comes out 8-bit SDR'],
  ['M016', '<Media src> given a string: no dimensions before render'],
  ['M017', 'Media requested with no media.server provider'],
  ['M018', 'An upload refused: not an image, or over the size limit'],
  ['M019', 'ffmpeg missing, not the pinned binary, or without an encoder'],
  [
    'M020',
    'Lossless frame delivery cannot be qualified, exceeds its output budget, or measured larger than the original',
  ],
]

export const media = definePlugin({
  name: '@kerf-js/media',
  version: '0.1.0',
  kerf: '*',
  namespace: 'M',
  options,
  permissions: {
    fs: {
      read: [
        '**/*.{png,jpg,jpeg,gif,webp,avif,svg,mp4,m4v,mov,webm,mkv,ogv,mp3,wav,flac,ogg,oga,opus,m4a,aac}',
      ],
    },
    env: ['KERF_MEDIA_DIR'],
    spawn: ['ssimulacra2'],
    native: true,
  },
  contribute: (o) => ({
    provides: [
      provide(mediaBuild, {
        sides: {
          build: {
            module: fileURLToPath(new URL('./build.mjs', import.meta.url)),
            export: 'createMediaBuild',
            options: o,
          },
        },
      }),
      provide(mediaServer, {
        sides: {
          server: {
            module: '@kerf-js/media/server',
            export: 'createMediaServer',
            options: o,
          },
        },
      }),
    ],
    check: { include: ['**/*.{tsx,jsx}'], run: (ctx) => checkMedia(ctx, { gifLimit: o.gifLimit }) },
    diagnostics: CODES.map(([code, catches]) => ({ code, catches, fix: `kerf docs ${code}` })),
    agents: {
      title: 'Media (@kerf-js/media)',
      text: [
        '- Import ?media; render Media from @kerf-js/core/media. It generates dimensions, responsive sources, posters and placeholders.',
        '- Only the LCP asset gets priority plus width/sizes. Describe images with alt; decoration uses alt="" decorative.',
        '- quality.lossless true verifies decoded pixels. video.delivery frames streams independent image chunks plus optional audio; auto measures and retains the original when larger. Never promise unmeasured savings.',
        '- Galleries use encoder compatible, swap manual. Call prepareMediaSave(asset,{signal,onProgress}) only on right-click; show progress, then Save with result.url/name. Abort on cancel; release() on close. Never flatten motion.',
        '- Retained originals save exact files. Generated stills can encode PNG/JPEG in a disposable worker; JPEG is a re-encode. See kerf docs media.',
        '- Upload with ctx.media.ingest; store its record, type z.media(), render Media.',
      ].join('\n'),
    },
    catalog: [
      {
        name: 'Media',
        import: '@kerf-js/core/media',
        summary: '<Media src={x} alt>: dimensions, AVIF + fallback, srcset/sizes, placeholder',
      },
    ],
  }),
})
