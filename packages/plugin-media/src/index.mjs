// media() for weft.config.ts (research 15 §7.4, research 26 §2, research 29 §6): provides media.build@1 (src/build.mjs,
// run by weft/vite for `?media` imports) and media.server@1 (src/server.mjs, the route for uploads and `encoder:
// 'server'`), and reports M001–M013 and M016 through its `check` hook (src/check.mjs).
import { fileURLToPath } from 'node:url'
import { definePlugin, defineSlot, provide } from 'weft/plugin'
import { checkMedia } from './check.mjs'

const mediaBuild = defineSlot({ id: 'media.build', version: 1, cardinality: 'one', sides: ['build'] })
const mediaServer = defineSlot({ id: 'media.server', version: 1, cardinality: 'one', sides: ['server'] })
const FORMATS = ['avif', 'webp']

const fail = (path, message) => {
  throw Object.assign(new Error(message), { path })
}

function options(input) {
  for (const key of Object.keys(input)) if (!['formats', 'widths', 'quality', 'placeholder', 'gifLimit', 'encoder', 'server'].includes(key)) fail(key, 'unknown option')
  const out = {}
  if (input.encoder !== undefined) {
    if (!['off', 'server'].includes(input.encoder)) fail('encoder', `\`${input.encoder}\`: 'off' or 'server' ('background' comes with the ffmpeg provider)`)
    out.encoder = input.encoder
  }
  if (input.server !== undefined) {
    const { dir, maxBytes } = input.server
    if (dir !== undefined && typeof dir !== 'string') fail('server.dir', 'a directory, relative to the app')
    if (maxBytes !== undefined && !(Number.isInteger(maxBytes) && maxBytes > 0)) fail('server.maxBytes', 'a positive number of bytes')
    out.server = input.server
  }
  if (input.formats !== undefined) {
    if (!Array.isArray(input.formats)) fail('formats', 'expected an array')
    for (const [i, f] of input.formats.entries()) if (!FORMATS.includes(f)) fail(`formats.${i}`, `\`${f}\`: the efficient formats are ${FORMATS.join(', ')} (the fallback follows the source)`)
    out.formats = input.formats
  }
  if (input.widths !== undefined) {
    if (!Array.isArray(input.widths) || !input.widths.length || !input.widths.every(w => Number.isInteger(w) && w > 0)) fail('widths', 'expected positive integers')
    out.widths = [...input.widths].sort((a, b) => a - b)
  }
  if (input.quality !== undefined) {
    const { target = 80, scorer = 'ssimulacra2' } = input.quality
    if (!(target > 0 && target <= 100)) fail('quality.target', 'an SSIMULACRA2 score, 1–100 (80 ≈ visually lossless at normal viewing)')
    if (typeof scorer !== 'string') fail('quality.scorer', "the SSIMULACRA2 command, or 'none' for fixed qualities")
    out.quality = { target, scorer }
  }
  if (input.placeholder !== undefined) out.placeholder = !!input.placeholder
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
  ['M016', '<Media src> given a string: no dimensions before render'],
  ['M017', 'Media requested with no media.server provider'],
  ['M018', 'An upload refused: not an image, or over the size limit'],
]

export const media = definePlugin({
  name: '@weft/plugin-media',
  version: '0.0.0',
  weft: '*',
  namespace: 'M',
  options,
  permissions: { fs: { read: ['**/*.{png,jpg,jpeg,gif,webp,avif,svg}'] }, spawn: ['ssimulacra2'], native: true },
  contribute: o => ({
    provides: [provide(mediaBuild, { sides: { build: { module: fileURLToPath(new URL('./build.mjs', import.meta.url)), export: 'createMediaBuild', options: o } } }), provide(mediaServer, { sides: { server: { module: '@weft/plugin-media/server', export: 'createMediaServer', options: o } } })],
    check: { include: ['**/*.{tsx,jsx}'], run: ctx => checkMedia(ctx, { gifLimit: o.gifLimit }) },
    diagnostics: CODES.map(([code, catches]) => ({ code, catches, fix: `weft docs ${code}` })),
    agents: {
      title: 'Media (@weft/plugin-media)',
      text: [
        "- Import images with `?media` and render `<Media src={x} alt=\"…\" />` from `weft/media`. Never hand-write srcset, sizes, width/height or blur placeholders.",
        '- Mark the one hero image `priority` and give it `width` (`"1/2"`, `"480px"`) so its `sizes` is right (M010). Nothing else gets `priority` (M009).',
        '- `alt` is required; use `alt="" decorative` for purely visual media (M007).',
        '- Never reference files in public/ by string (M013) or render `?url` imports in `<img>` (M002).',
        "- Uploads: `await ctx.media.ingest(file)` in a mutation returns a record. Store it, type the field `z.media()` (from `@weft/start/media`), and pass it to `<Media src>` (M016).",
      ].join('\n'),
    },
    catalog: [{ name: 'Media', import: 'weft/media', summary: '<Media src={x} alt>: dimensions, AVIF + fallback, srcset/sizes, placeholder' }],
  }),
})
