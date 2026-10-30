// media.build@1 (research 15 §2–4, research 26 §2.4): one source file in, a MediaAsset and its files out.
//   probe (sharp, EXIF orientation) → width ladder → per-format quality search at the largest width (SSIMULACRA2,
//   the libjxl tool) → encode every width → dominant colour + 16 px WebP placeholder. SVG: refuse unsafe files
//   (M012), then SVGO. Animated GIFs stay as they are (video conversion is @weft/plugin-media-ffmpeg, Phase 3c).
// Cached by content hash under `cacheDir`, so dev restarts and rebuilds don't re-encode. With `encoder: 'server'` the
// build only stores the original: the variants are media.server@1's to encode (research 29 §6).
import { execFile, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { optimize } from 'svgo'
import { probe } from 'weft/media-probe'
import { createMediaServer } from './server.mjs'
import { unsafeSvg } from './svg.mjs'

const run = promisify(execFile)
const VERSION = 1 // bump when the output for the same input and options changes

export const DEFAULTS = {
  formats: ['avif'],
  widths: [320, 640, 960, 1280, 1920, 2560],
  quality: { target: 80, scorer: 'ssimulacra2' },
  placeholder: true,
  gifLimit: 256 * 1024,
}
/** Encoder settings without a scorer (research 26 §2.4), and the range the search walks. */
export const FIXED = { avif: 50, webp: 75, jpeg: 78 }
const RANGE = { avif: [20, 90], webp: [40, 95], jpeg: [40, 95] }
export const MIME = { avif: 'image/avif', webp: 'image/webp', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', svg: 'image/svg+xml' }
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

export const encoders = {
  avif: (img, q) => img.avif({ quality: q, effort: 4, chromaSubsampling: '4:2:0' }),
  webp: (img, q) => img.webp({ quality: q, effort: 5 }),
  jpeg: (img, q) => img.jpeg({ quality: q, mozjpeg: true }),
  png: img => img.png({ compressionLevel: 9, effort: 8 }),
}

/** Lowest quality whose SSIMULACRA2 score is ≥ target, within 5 encodes (scores rise with quality). */
async function search(format, base, width, scorer, target, dir) {
  const ref = join(dir, 'ref.png')
  if (!existsSync(ref)) writeFileSync(ref, await base().resize({ width }).png().toBuffer())
  const score = async q => {
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

export const hex = ({ r, g, b }) => `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`
/** Lossy sources get a lossy fallback; a WebP with alpha is a graphic. */
export const isPhoto = meta => ['jpeg', 'jpg', 'avif', 'heif', 'tiff', 'webp'].includes(meta.format) && !(meta.format === 'webp' && meta.hasAlpha)
const short = bytes => createHash('sha256').update(bytes).digest('hex').slice(0, 8)

export function createMediaBuild(input = {}) {
  const o = { ...DEFAULTS, ...input, quality: { ...DEFAULTS.quality, ...input.quality } }
  return {
    /**
     * @param {{ file: string, bytes: Uint8Array }} source
     * @param {{ cacheDir: string, dev?: boolean }} ctx
     */
    async build({ file, bytes }, { cacheDir, root }) {
      const name = basename(file)
      if (o.encoder === 'server') {
        try {
          return { asset: await createMediaServer(o).at(root).ingest(bytes, { name }), files: [] }
        } catch (e) {
          if (!e.code) throw e
          return { asset: null, files: [], diagnostics: [{ code: e.code, severity: 'error', message: e.message }] }
        }
      }
      const stem = basename(file, extname(file)).replace(/[^\w-]+/g, '-')
      const key = createHash('sha256').update(bytes).update(JSON.stringify(o)).update(String(VERSION)).digest('hex').slice(0, 20)
      const cached = join(cacheDir, `${key}.json`)
      if (existsSync(cached)) {
        const hit = JSON.parse(readFileSync(cached, 'utf8'))
        return { ...hit, files: hit.files.map(n => ({ name: n, bytes: new Uint8Array(readFileSync(join(cacheDir, key, n))) })) }
      }

      const out = await (/\.svg$/i.test(file) ? vector(name, stem, bytes) : raster(name, stem, bytes, o))
      if (out.diagnostics?.some(d => d.severity === 'error')) return out
      mkdirSync(join(cacheDir, key), { recursive: true })
      for (const f of out.files) writeFileSync(join(cacheDir, key, f.name), f.bytes)
      writeFileSync(cached, JSON.stringify({ ...out, files: out.files.map(f => f.name) }))
      return out
    },
  }
}

/** SVG: refuse what can run or fetch (M012), else SVGO's default preset (it keeps the viewBox). */
function vector(name, stem, bytes) {
  const text = new TextDecoder().decode(bytes)
  const unsafe = unsafeSvg(text)
  if (unsafe.length) return { asset: null, files: [], diagnostics: [{ code: 'M012', severity: 'error', message: `${name} has ${unsafe.join(', ')}: an image with active content or external references is not optimised or served. Sanitise the file.` }] }
  const size = probe(bytes, name)
  if (!size) return { asset: null, files: [], diagnostics: [{ code: 'M001', severity: 'error', message: `${name} has no width/height or viewBox, so its size is unknown.` }] }
  const svg = new TextEncoder().encode(optimize(text, { multipass: true }).data)
  const fileName = `${stem}-${short(svg)}.svg`
  return { asset: { kind: 'vector', src: fileName, width: size.width, height: size.height, type: MIME.svg, sources: [], name, quality: 'original' }, files: [{ name: fileName, bytes: svg }] }
}

async function raster(name, stem, bytes, o) {
  const meta = await sharp(bytes).metadata()
  const turned = (meta.orientation ?? 1) >= 5
  const width = turned ? meta.height : meta.width
  const height = turned ? meta.width : meta.height
  const diagnostics = []

  if (meta.format === 'gif' && (meta.pages ?? 1) > 1) {
    // Animated: kept as is until the ffmpeg provider can turn it into video.
    if (bytes.length > o.gifLimit) diagnostics.push({ code: 'M004', severity: 'warning', message: `${name} is a ${Math.round(bytes.length / 1024)} KB animated GIF; it ships as is (video conversion comes with @weft/plugin-media-ffmpeg).` })
    const fileName = `${stem}-${short(bytes)}.gif`
    return { asset: { kind: 'graphic', src: fileName, width, height, type: MIME.gif, sources: [], name, quality: 'original' }, files: [{ name: fileName, bytes }], diagnostics }
  }

  const photo = isPhoto(meta)
  const fallback = photo ? 'jpeg' : 'png'
  const formats = [...new Set(o.formats.filter(f => f !== fallback)), fallback]
  const largest = Math.min(width, o.widths.at(-1))
  const ladder = [...new Set([...o.widths.filter(w => w < largest), largest])]
  const base = () => sharp(bytes).rotate()

  const scorer = findScorer(o.quality.scorer)
  const dir = scorer ? mkdtempSync(join(tmpdir(), 'weft-media-')) : null
  const qualities = {}
  try {
    for (const f of formats) {
      if (f === 'png') continue
      qualities[f] = scorer ? await search(f, base, largest, scorer, o.quality.target, dir) : FIXED[f]
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

  const asset = { kind: photo ? 'photo' : 'graphic', src, width, height, type: MIME[fallback], sources, name, quality: scorer ? 'ssimulacra2' : 'fixed', qualities }
  if (o.placeholder) {
    asset.dominant = hex((await base().stats()).dominant)
    const tiny = await base().resize(16, 16, { fit: 'inside' }).webp({ quality: 40 }).toBuffer()
    asset.placeholder = `data:image/webp;base64,${tiny.toString('base64')}`
  }
  return { asset, files, diagnostics }
}
