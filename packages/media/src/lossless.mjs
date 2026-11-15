// Full decoded-pixel checks, including invisible RGB, qualify every efficient image. Originals remain byte-identical.
import sharp from 'sharp'
import { createHash } from 'node:crypto'
import { extname } from 'node:path'
import { withPlaceholder, hex } from './shared.mjs'
import { animatedLossless } from './animated-lossless.mjs'

/** A content digest binds encoded files and decoded-frame verification. */
export const pixelHash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const suffix = { jpeg: 'jpg', png: 'png', webp: 'webp', avif: 'avif', gif: 'gif' }

/** Encode an RGBA raster only with formats whose full decode matches the reference exactly. */
export async function losslessImages(bytes, width, height, formats, stem) {
  const pipeline = () => sharp(bytes, { raw: { width, height, channels: 4 } })
  const outputs = []
  for (const format of [...new Set([...formats, 'png'])]) {
    let image = pipeline()
    if (format === 'avif')
      image = image.avif({ lossless: true, effort: 4, chromaSubsampling: '4:4:4' })
    else if (format === 'webp') image = image.webp({ lossless: true, effort: 5 })
    else image = image.png({ compressionLevel: 9 })
    const encoded = await image.toBuffer()
    const decoded = await sharp(encoded).ensureAlpha().raw().toBuffer()
    if (!decoded.equals(bytes)) continue
    outputs.push({
      name: `${stem}-${pixelHash(encoded).slice(0, 20)}.${format}`,
      bytes: new Uint8Array(encoded),
      type: `image/${format}`,
    })
  }
  if (!outputs.length) throw new Error('No image encoder preserved every decoded RGBA byte')
  return outputs.sort((a, b) => a.bytes.length - b.bytes.length)
}

/** The official raster provider's exact-pixel mode; no application override is necessary. */
export async function losslessRaster({ bytes, name, stem }, o) {
  const metadata = await sharp(bytes, { animated: true }).metadata()
  const format =
    metadata.format === 'heif' && metadata.compression === 'av1' ? 'avif' : metadata.format
  const originalName = `${stem}-original-${pixelHash(bytes).slice(0, 20)}.${suffix[format] ?? extname(name).slice(1)}`
  const original = {
    src: originalName,
    type: metadata.mediaType ?? `image/${format}`,
    name,
    bytes: bytes.length,
  }
  const files = [{ name: originalName, bytes }]
  if ((metadata.pages ?? 1) > 1)
    return animatedLossless(
      {
        bytes,
        stem,
        metadata,
        original,
        baseline: animatedOriginal({ metadata, original, name, files, o }),
      },
      o,
    )

  const reference = await sharp(bytes)
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width, height } = reference.info
  const largest = Math.min(width, o.widths.at(-1)),
    widths = [...new Set([...o.widths.filter((value) => value < largest), largest])]
  const delivery = exactSources(
    await exactRungs(reference, widths, { formats: o.formats, stem }),
    widths,
    { ...original, width },
  )
  files.push(...delivery.files)
  const asset = {
    kind: metadata.format === 'jpeg' ? 'photo' : 'graphic',
    src: originalName,
    width,
    height,
    type: original.type,
    sources: delivery.sources,
    name,
    quality: 'original',
    animated: false,
    original,
  }
  if (o.encoder === 'compatible') {
    asset.copy = { src: originalName, type: original.type, bytes: bytes.length }
    asset.swap = o.swap ?? 'intent'
  }
  if (o.placeholder) {
    asset.dominant = hex((await sharp(bytes).stats()).dominant)
    await withPlaceholder(asset, files, sharp(bytes).rotate(), stem, o)
  }
  return {
    asset,
    files,
    diagnostics: [],
    verification: {
      pixels: 'exact',
      widths: delivery.efficient ? widths : [width],
      selected: delivery.efficient ? 'raster' : 'original',
    },
  }
}

function exactSources(rungs, widths, original) {
  const types = rungs[0]
    .map((file) => file.type)
    .filter((type) => rungs.every((candidates) => candidates.some((file) => file.type === type)))
  const ladders = types
    .map((type) => rungs.map((candidates) => candidates.find((file) => file.type === type)))
    .sort(
      (a, b) =>
        a.reduce((sum, file) => sum + file.bytes.length, 0) -
        b.reduce((sum, file) => sum + file.bytes.length, 0),
    )
  const selected = ladders[0]
  const efficient = selected.at(-1).bytes.length <= original.bytes
  const sources = efficient
    ? [
        {
          type: selected[0].type,
          srcset: selected.map((file, index) => `${file.name} ${widths[index]}w`).join(', '),
        },
      ]
    : []
  // A picture chooses a format before a width, so every offered format must have a complete ladder.
  sources.push({ type: original.type, srcset: `${original.src} ${original.width}w` })
  return { sources, efficient, files: efficient ? selected : [] }
}

async function exactRungs(reference, widths, { formats, stem }) {
  const { width, height } = reference.info
  const rungs = []
  for (const size of widths) {
    const resized = await sharp(reference.data, { raw: { width, height, channels: 4 } })
      .resize({ width: size })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const candidates = await losslessImages(
      resized.data,
      resized.info.width,
      resized.info.height,
      formats,
      `${stem}-${size}`,
    )
    rungs.push(candidates)
  }
  return rungs
}

function animatedOriginal({ metadata, original, name, files, o }) {
  return {
    asset: {
      kind: 'graphic',
      src: original.src,
      width: metadata.width,
      height: metadata.pageHeight ?? metadata.height,
      type: original.type,
      sources: [],
      name,
      quality: 'original',
      original,
      animated: true,
      ...(o.encoder === 'compatible' && {
        copy: { src: original.src, type: original.type, bytes: original.bytes },
        swap: o.swap ?? 'intent',
      }),
    },
    files,
    diagnostics: [],
  }
}
