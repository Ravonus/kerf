//   probe (sharp, EXIF orientation) → width ladder → per-format quality search at the largest width (SSIMULACRA2,
//   the libjxl tool) → encode every width → dominant colour + 16 px WebP placeholder. SVG: refuse unsafe files
//   (M012), then SVGO. With a media.encode@1 provider (@weft-js/plugin-media-ffmpeg), src/video.mjs takes video, audio
//   and animated GIFs; without one, a GIF stays as it is and video is P101.
// Cached by content hash under `cacheDir`, so dev restarts and rebuilds don't re-encode. With `encoder: 'server'` the
// build only stores the original: the variants are media.server@1's to encode.
import { execFile, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { optimize } from 'svgo'
import { probe } from '@weft-js/core/media-probe'
import { createMediaServer } from './server.mjs'
import { DEFAULTS, FIXED, encoders, hex, isPhoto, MIME, withPlaceholder } from './shared.mjs'
import { unsafeSvg } from './svg.mjs'
import { AUDIO, audioFile, gif, VIDEO, video } from './video.mjs'

const run = promisify(execFile)
const VERSION = 2 // bump when the output for the same input and options changes

export { DEFAULTS, FIXED, MIME, encoders, hex, isPhoto } from './shared.mjs'

/** The range the quality search walks. */
const RANGE = { avif: [20, 90], webp: [40, 95], jpeg: [40, 95] }
const EXT = { avif: 'avif', webp: 'webp', jpeg: 'jpg', png: 'png', gif: 'gif', svg: 'svg' }

const scorers = new Map()
/** The SSIMULACRA2 command if it runs, else null (the search then uses FIXED and says `quality: 'fixed'`). */
export function findScorer(name) {
  if (!name || name === 'none') return null
  if (!scorers.has(name)) {
    const r = spawnSync(name, [], { encoding: 'utf8' })
    scorers.set(name, r.error ? null : name)
  }
  return scorers.get(name)
}

/** Lowest quality whose SSIMULACRA2 score is ≥ target, within 5 encodes (scores rise with quality). */
async function search({ format, base, width, scorer, target, dir }) {
  const ref = join(dir, 'ref.png')
  if (!existsSync(ref)) writeFileSync(ref, await base().resize({ width }).png().toBuffer())
  const score = async (q) => {
    const encoded = await encoders[format](base().resize({ width }), q).toBuffer()
    const out = join(dir, `${format}-${q}.png`)
    writeFileSync(out, await sharp(encoded).png().toBuffer())
    const { stdout } = await run(scorer, [ref, out])
    return parseFloat(stdout)
  }
  let [lo, hi] = RANGE[format]
  for (let i = 0; i < 5 && lo < hi; i++) {
    const mid = Math.floor((lo + hi) / 2)
    if ((await score(mid)) >= target) hi = mid
    else lo = mid + 1
  }
  return hi
}

const short = (bytes) => createHash('sha256').update(bytes).digest('hex').slice(0, 8)

/** The media.build@1 provider: `build` takes one source file and gives back its asset and encoded files, cached by content. */
export function createMediaBuild(input = {}) {
  const o = {
    ...DEFAULTS,
    ...input,
    quality: { ...DEFAULTS.quality, ...input.quality },
    video: { ...DEFAULTS.video, ...input.video },
  }
  return {
    /**
     * @param {{ file: string, bytes: Uint8Array }} source
     * @param {{ cacheDir: string, dev?: boolean, encode?: Record<string, object> }} ctx
     */
    async build({ file, bytes, audio }, { cacheDir, root, encode = {} }) {
      const name = basename(file)
      const timed = VIDEO.test(file) || AUDIO.test(file)
      if (o.encoder === 'server' && !timed) {
        try {
          return {
            asset: await createMediaServer(o).at(root, encode).ingest(bytes, { name }),
            files: [],
          }
        } catch (e) {
          if (!e.code) throw e
          return {
            asset: null,
            files: [],
            diagnostics: [{ code: e.code, severity: 'error', message: e.message }],
          }
        }
      }
      const stem = basename(file, extname(file)).replace(/[^\w-]+/g, '-')
      const key = createHash('sha256')
        .update(bytes)
        .update(JSON.stringify(o))
        .update(String(VERSION))
        .update(audio ? readFileSync(audio) : '')
        .update(JSON.stringify(await versions(encode)))
        .digest('hex')
        .slice(0, 20)
      const cached = join(cacheDir, `${key}.json`)
      if (existsSync(cached)) {
        const hit = JSON.parse(readFileSync(cached, 'utf8'))
        return {
          ...hit,
          files: hit.files.map((n) => ({
            name: n,
            bytes: new Uint8Array(readFileSync(join(cacheDir, key, n))),
          })),
        }
      }

      const source = { bytes, name, stem, audio }
      const scorer = findScorer(o.quality.scorer)
      const out = await (/\.svg$/i.test(file)
        ? vector(name, stem, bytes)
        : VIDEO.test(file)
          ? video(source, o, encode, scorer)
          : AUDIO.test(file)
            ? audioFile(source, o, encode)
            : raster(source, o, encode))
      if (out.diagnostics?.some((d) => d.severity === 'error')) return out
      mkdirSync(join(cacheDir, key), { recursive: true })
      for (const f of out.files) writeFileSync(join(cacheDir, key, f.name), f.bytes)
      writeFileSync(cached, JSON.stringify({ ...out, files: out.files.map((f) => f.name) }))
      return out
    },
  }
}

/** What the encoders are: a new ffmpeg means new bytes. */
async function versions(encode) {
  const found = {}
  for (const [key, enc] of Object.entries(encode))
    found[key] = await enc.versions().catch(() => null)
  return found
}

/** SVG: refuse what can run or fetch (M012), else SVGO's default preset (it keeps the viewBox). */
function vector(name, stem, bytes) {
  const text = new TextDecoder().decode(bytes)
  const unsafe = unsafeSvg(text)
  if (unsafe.length)
    return {
      asset: null,
      files: [],
      diagnostics: [
        {
          code: 'M012',
          severity: 'error',
          message: `${name} has ${unsafe.join(', ')}: an image with active content or external references is not optimised or served. Sanitise the file.`,
        },
      ],
    }
  const size = probe(bytes, name)
  if (!size)
    return {
      asset: null,
      files: [],
      diagnostics: [
        {
          code: 'M001',
          severity: 'error',
          message: `${name} has no width/height or viewBox, so its size is unknown.`,
        },
      ],
    }
  const svg = new TextEncoder().encode(optimize(text, { multipass: true }).data)
  const fileName = `${stem}-${short(svg)}.svg`
  return {
    asset: {
      kind: 'vector',
      src: fileName,
      width: size.width,
      height: size.height,
      type: MIME.svg,
      sources: [],
      name,
      quality: 'original',
    },
    files: [{ name: fileName, bytes: svg }],
  }
}

async function animatedGif(
  { bytes, name, stem, audio, meta, width, height },
  o,
  encode,
  diagnostics,
) {
  const converted = await gif(
    { bytes, name, stem, audio, meta, width, height },
    o,
    encode,
    findScorer(o.quality.scorer),
  )
  if (converted) return converted
  if (bytes.length > o.gifLimit)
    diagnostics.push({
      code: 'M004',
      severity: 'warning',
      message: `${name} is a ${Math.round(bytes.length / 1024)} KB animated GIF, and it ships as is${encode['video/h264'] ? ': nothing beat it by 15%' : '. Add `mediaFfmpeg()` from @weft-js/plugin-media-ffmpeg to turn it into video'}.`,
    })
  const fileName = `${stem}-${short(bytes)}.gif`
  return {
    asset: {
      kind: 'graphic',
      src: fileName,
      width,
      height,
      type: MIME.gif,
      sources: [],
      name,
      quality: 'original',
    },
    files: [{ name: fileName, bytes }],
    diagnostics,
  }
}

async function raster({ bytes, name, stem, audio }, o, encode) {
  const meta = await sharp(bytes, { animated: true }).metadata()
  const turned = (meta.orientation ?? 1) >= 5
  const width = turned ? meta.height : meta.width
  const height = turned ? (meta.pageHeight ?? meta.width) : (meta.pageHeight ?? meta.height)
  const diagnostics = []

  if (meta.format === 'gif' && (meta.pages ?? 1) > 1)
    return animatedGif({ bytes, name, stem, audio, meta, width, height }, o, encode, diagnostics)

  const photo = isPhoto(meta)
  const fallback = photo ? 'jpeg' : 'png'
  const formats = [...new Set(o.formats.filter((f) => f !== fallback)), fallback]
  const largest = Math.min(width, o.widths.at(-1))
  const ladder = [...new Set([...o.widths.filter((w) => w < largest), largest])]
  const base = () => sharp(bytes).rotate()

  const scorer = findScorer(o.quality.scorer)
  const dir = scorer ? mkdtempSync(join(tmpdir(), 'weft-media-')) : null
  const qualities = {}
  try {
    for (const f of formats) {
      if (f === 'png') continue
      qualities[f] = scorer
        ? await search({ format: f, base, width: largest, scorer, target: o.quality.target, dir })
        : FIXED[f]
    }
  } finally {
    if (dir) rmSync(dir, { recursive: true, force: true })
  }

  const files = []
  const sources = []
  for (const f of formats) {
    const entries = []
    for (const w of ladder) {
      const encoded = await encoders[f](base().resize({ width: w }), qualities[f]).toBuffer()
      const fileName = `${stem}-${w}-${short(encoded)}.${EXT[f]}`
      files.push({ name: fileName, bytes: new Uint8Array(encoded) })
      entries.push([fileName, w])
    }
    sources.push({ type: MIME[f], srcset: entries.map(([n, w]) => `${n} ${w}w`).join(', ') })
  }
  const src = sources.at(-1).srcset.split(', ').at(-1).split(' ')[0]

  const asset = {
    kind: photo ? 'photo' : 'graphic',
    src,
    width,
    height,
    type: MIME[fallback],
    sources,
    name,
    quality: scorer ? 'ssimulacra2' : 'fixed',
    qualities,
  }
  if (o.encoder === 'compatible') {
    // The fallback ladder is already built: a swap costs no extra files.
    asset.copy = { src, type: MIME[fallback] }
    asset.swap = o.swap ?? 'intent'
    diagnostics.push({
      code: 'M014',
      severity: 'info',
      message: `${name}: \`encoder: 'compatible'\` adds 0 KB: the compatible copy is the fallback ladder.`,
    })
  }
  if (o.placeholder) {
    asset.dominant = hex((await base().stats()).dominant)
    await withPlaceholder(asset, files, base(), stem, o)
  }
  return { asset, files, diagnostics }
}
