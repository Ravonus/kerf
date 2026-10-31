// media.server@1 (research 15 §5.4, research 29 §6): uploads, CMS images and `encoder: 'server'`. `ingest` stores an
// original under its hash and returns the record `z.media()` validates; `serve` answers `/_weft/m/<hash>/<w>.<fmt>`,
// encoding each variant once and keeping it next to the original. `auto` negotiates on `Accept`. Only widths on the
// ladder and formats in the config are served, so a URL can't ask for unbounded work. Video, audio and animated GIFs go
// through src/upload.mjs when media.encode@1 is bound.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import sharp from 'sharp'
import { optimize } from 'svgo'
import { probe } from 'weft/media-probe'
import { DEFAULTS, FIXED, encoders, hex, isPhoto, MIME } from './build.mjs'
import { unsafeSvg } from './svg.mjs'
import { sniff, uploads } from './upload.mjs'

const ROUTE = '/_weft/m'
const FORMATS_TIMED = new Set(['mp4', 'webm', 'm4a', 'gif', 'webp'])
const MAX_BYTES = 20 * 1024 * 1024
const EXT = { avif: 'avif', webp: 'webp', jpeg: 'jpg', png: 'png' }
const FORMAT = { avif: 'avif', webp: 'webp', jpg: 'jpeg', png: 'png' }

const refuse = (code, message) => {
  throw Object.assign(new Error(message), { code })
}

/** The first of `formats` the client names with a q above 0, else `fallback`. `*` promises nothing: only names count. */
export function negotiate(accept, formats, fallback) {
  const q = new Map()
  for (const part of accept.split(',')) {
    const [type, ...params] = part.trim().toLowerCase().split(';')
    const v = params.map(p => /^\s*q=([\d.]+)/.exec(p)?.[1]).find(Boolean)
    q.set(type.trim(), v === undefined ? 1 : Number(v))
  }
  return formats.find(f => q.get(MIME[f]) > 0) ?? fallback
}

export function createMediaServer(input = {}) {
  const o = { ...DEFAULTS, ...input, video: { ...DEFAULTS.video, ...input.video } }
  return { at: (root, encode = {}) => storage(o, root, encode) }
}

function storage(o, root, encode) {
  const dir = process.env.WEFT_MEDIA_DIR ? resolve(process.env.WEFT_MEDIA_DIR) : resolve(root ?? process.cwd(), o.server?.dir ?? '.weft/media')
  const limit = o.server?.maxBytes ?? MAX_BYTES
  const flight = new Map()
  const url = (hash, width, format = 'auto') => `${ROUTE}/${hash}/${width}.${format}`
  const metaOf = hash => {
    const file = join(dir, hash, 'meta.json')
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null
  }

  /** The record and what `serve` needs; written last, so a meta.json means the original is whole. */
  function store(hash, bytes, asset, meta) {
    mkdirSync(join(dir, hash), { recursive: true })
    writeFileSync(join(dir, hash, 'source'), bytes)
    const tmp = join(dir, hash, `meta.${process.pid}.tmp`)
    writeFileSync(tmp, JSON.stringify({ ...meta, asset }))
    renameSync(tmp, join(dir, hash, 'meta.json'))
    return asset
  }

  const timed = uploads({ o, dir, encode, url, store, refuse })

  async function ingest(bytes, { name = 'upload' } = {}) {
    if (bytes.length > limit) refuse('M018', `${name} is ${Math.round(bytes.length / 1048576)} MB, over the ${Math.round(limit / 1048576)} MB limit.`)
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 32)
    const known = metaOf(hash)
    if (known) return { ...known.asset, name }
    const kind = sniff(bytes)
    if (kind) {
      if (!encode['video/h264']) refuse('M018', `${name} is ${kind}, and nothing here encodes it: add \`mediaFfmpeg()\` from @weft/plugin-media-ffmpeg to \`plugins\`, with ffmpeg on the server.`)
      mkdirSync(join(dir, hash), { recursive: true })
      return timed.ingest(hash, bytes, name, kind)
    }
    const size = probe(bytes, name)
    if (size?.type === 'image/svg+xml') {
      const text = new TextDecoder().decode(bytes)
      const unsafe = unsafeSvg(text)
      if (unsafe.length) refuse('M012', `${name} has ${unsafe.join(', ')}: an image with active content or external references is not stored.`)
      const svg = new TextEncoder().encode(optimize(text, { multipass: true }).data)
      return store(hash, svg, { kind: 'vector', src: url(hash, size.width), width: size.width, height: size.height, type: MIME.svg, sources: [], name, quality: 'original' }, { ladder: [size.width], type: MIME.svg })
    }
    let meta
    try { meta = await sharp(bytes, { animated: true }).metadata() } catch { refuse('M018', `${name} isn't an image weft can read (PNG, JPEG, GIF, WebP, AVIF, SVG).`) }
    const turned = (meta.orientation ?? 1) >= 5
    const tall = meta.pageHeight ?? meta.height
    const width = turned ? tall : meta.width
    const height = turned ? meta.width : tall
    if (meta.format === 'gif' && (meta.pages ?? 1) > 1) { // Animated: video when that's a saving, else as it is.
      mkdirSync(join(dir, hash), { recursive: true })
      const video = await timed.gif(hash, bytes, name, meta)
      if (video) return video
      return store(hash, bytes, { kind: 'graphic', src: url(hash, width), width, height, type: MIME.gif, sources: [], name, quality: 'original' }, { ladder: [width], type: MIME.gif })
    }
    const photo = isPhoto(meta)
    const fallback = photo ? 'jpeg' : 'png'
    const largest = Math.min(width, o.widths.at(-1))
    const ladder = [...new Set([...o.widths.filter(w => w < largest), largest])]
    const asset = {
      kind: photo ? 'photo' : 'graphic', src: url(hash, largest), width, height, type: MIME[fallback],
      sources: [{ type: MIME[fallback], srcset: ladder.map(w => `${url(hash, w)} ${w}w`).join(', ') }], name, quality: 'fixed',
    }
    if (o.placeholder) {
      const base = () => sharp(bytes).rotate()
      asset.dominant = hex((await base().stats()).dominant)
      asset.placeholder = `data:image/webp;base64,${(await base().resize(16, 16, { fit: 'inside' }).webp({ quality: 40 }).toBuffer()).toString('base64')}`
    }
    return store(hash, bytes, asset, { ladder, fallback })
  }

  /** One variant, encoded once: concurrent requests share the encode, and the file lands whole or not at all. */
  function variant(hash, width, format) {
    const file = join(dir, hash, `${width}.${EXT[format]}`)
    if (existsSync(file)) return readFileSync(file)
    const key = `${hash}/${width}.${format}`
    if (!flight.has(key)) {
      const work = (async () => {
        const img = sharp(readFileSync(join(dir, hash, 'source'))).rotate().resize({ width })
        const bytes = await encoders[format](img, FIXED[format]).toBuffer()
        const tmp = `${file}.${process.pid}.tmp`
        writeFileSync(tmp, bytes)
        renameSync(tmp, file)
        return bytes
      })().finally(() => flight.delete(key))
      flight.set(key, work)
    }
    return flight.get(key)
  }

  async function serve({ hash, width, format, accept }) {
    const meta = /^[0-9a-f]{32}$/.test(hash) ? metaOf(hash) : null
    if (meta?.timed) return FORMATS_TIMED.has(format) ? timed.serve(hash, meta, width, format) : null
    if (!meta?.ladder.includes(width)) return null
    const negotiated = format === 'auto'
    if (meta.type) return negotiated ? { bytes: readFileSync(join(dir, hash, 'source')), type: meta.type, width, format: 'source', negotiated: false } : null
    const fmt = negotiated ? negotiate(accept, o.formats, meta.fallback) : FORMAT[format]
    if (!fmt || !(fmt === meta.fallback || o.formats.includes(fmt))) return null
    return { bytes: new Uint8Array(await variant(hash, width, fmt)), type: MIME[fmt], width, format: fmt, negotiated }
  }

  return { ingest, serve, settled: timed.settled }
}
