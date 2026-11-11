import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { optimize } from 'svgo'
import { probe } from '@kerf-js/core/media-probe'
import { hex, isPhoto, MIME } from '../shared.mjs'
import { unsafeSvg } from '../svg.mjs'
import { sniff } from '../upload.mjs'

export function imageIngest({ limit, metaOf, dir, encode, timed, url, store, refuse, o }) {
  return async function ingest(bytes, { name = 'upload' } = {}) {
    if (bytes.length > limit)
      refuse(
        'M018',
        `${name} is ${Math.round(bytes.length / 1048576)} MB, over the ${Math.round(limit / 1048576)} MB limit.`,
      )
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 32)
    const known = metaOf(hash)
    if (known) return { ...known.asset, name }
    const kind = sniff(bytes)
    if (kind) {
      if (!encode['video/h264'])
        refuse(
          'M018',
          `${name} is ${kind}, and nothing here encodes it: add \`mediaFfmpeg()\` from @kerf-js/media-ffmpeg to \`plugins\`, with ffmpeg on the server.`,
        )
      mkdirSync(join(dir, hash), { recursive: true })
      return timed.ingest(hash, bytes, name, kind)
    }
    const size = probe(bytes, name)
    if (size?.type === 'image/svg+xml')
      return storeSvg(hash, bytes, name, size, { refuse, url, store })
    let meta
    try {
      meta = await sharp(bytes, { animated: true }).metadata()
    } catch {
      refuse('M018', `${name} isn't an image kerf can read (PNG, JPEG, GIF, WebP, AVIF, SVG).`)
    }
    const turned = (meta.orientation ?? 1) >= 5
    const tall = meta.pageHeight ?? meta.height
    const width = turned ? tall : meta.width
    const height = turned ? meta.width : tall
    if (meta.format === 'gif' && (meta.pages ?? 1) > 1) {
      // Animated: video when that's a saving, else as it is.
      mkdirSync(join(dir, hash), { recursive: true })
      const video = await timed.gif(hash, bytes, name, meta)
      if (video) return video
      return store(
        hash,
        bytes,
        {
          kind: 'graphic',
          src: url(hash, width),
          width,
          height,
          type: MIME.gif,
          sources: [],
          name,
          quality: 'original',
        },
        { ladder: [width], type: MIME.gif },
      )
    }
    return storeRaster({ meta, width, height, o, url, hash, name, bytes, store })
  }
}

function storeSvg(hash, bytes, name, size, { refuse, url, store }) {
  const text = new TextDecoder().decode(bytes)
  const unsafe = unsafeSvg(text)
  if (unsafe.length)
    refuse(
      'M012',
      `${name} has ${unsafe.join(', ')}: an image with active content or external references is not stored.`,
    )
  const svg = new TextEncoder().encode(optimize(text, { multipass: true }).data)
  return store(
    hash,
    svg,
    {
      kind: 'vector',
      src: url(hash, size.width),
      width: size.width,
      height: size.height,
      type: MIME.svg,
      sources: [],
      name,
      quality: 'original',
    },
    { ladder: [size.width], type: MIME.svg },
  )
}

async function storeRaster({ meta, width, height, o, url, hash, name, bytes, store }) {
  const photo = isPhoto(meta)
  const fallback = photo ? 'jpeg' : 'png'
  const largest = Math.min(width, o.widths.at(-1))
  const ladder = [...new Set([...o.widths.filter((w) => w < largest), largest])]
  const asset = {
    kind: photo ? 'photo' : 'graphic',
    src: url(hash, largest),
    width,
    height,
    type: MIME[fallback],
    sources: [
      { type: MIME[fallback], srcset: ladder.map((w) => `${url(hash, w)} ${w}w`).join(', ') },
    ],
    name,
    quality: 'fixed',
  }
  if (o.placeholder) {
    const base = () => sharp(bytes).rotate()
    asset.dominant = hex((await base().stats()).dominant)
    asset.placeholder = `data:image/webp;base64,${(await base().resize(16, 16, { fit: 'inside' }).webp({ quality: 40 }).toBuffer()).toString('base64')}`
  }
  return store(hash, bytes, asset, { ladder, fallback })
}
