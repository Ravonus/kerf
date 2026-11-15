// Motion is never flattened to a still: smaller animated WebP must preserve every visible frame and its timing.
import { createHash } from 'node:crypto'
import sharp from 'sharp'

async function pixels(bytes, visible) {
  const hash = createHash('sha256')
  let tail = Buffer.alloc(0)
  for await (const chunk of sharp(bytes, { animated: true }).ensureAlpha().raw()) {
    const data = tail.length ? Buffer.concat([tail, chunk]) : chunk,
      length = data.length - (data.length % 4)
    if (visible)
      for (let offset = 0; offset < length; offset += 4)
        if (!data[offset + 3]) data.fill(0, offset, offset + 3)
    hash.update(data.subarray(0, length))
    tail = data.subarray(length)
  }
  if (tail.length) throw new Error('Animation has incomplete RGBA output')
  return hash.digest('hex')
}

function timing(a, b) {
  return (
    a.width === b.width &&
    a.pageHeight === b.pageHeight &&
    a.pages === b.pages &&
    (a.loop ?? 1) === (b.loop ?? 1) &&
    JSON.stringify(a.delay) === JSON.stringify(b.delay)
  )
}

/** Exact animated-image optimization with unchanged source bytes retained for Save. */
export async function animatedLossless({ bytes, stem, metadata, original, baseline }, o) {
  const visible = o.video.lossless === false,
    mode = visible ? 'visible-rgba' : 'exact-rgba'
  const keep = (reason) => ({
    ...baseline,
    verification: { selected: 'original', animation: 'preserved', reason },
  })
  if (metadata.width * metadata.height > 64 * 1024 * 1024)
    return keep('animation exceeds the 64 megapixel total decode budget')
  if ((metadata.delay ?? []).some((delay) => delay < 20))
    return keep('short GIF timing needs its native browser interpretation')
  const encoded = await sharp(bytes, { animated: true })
    .webp({ lossless: true, effort: 5, loop: metadata.loop ?? 1, delay: metadata.delay })
    .toBuffer()
  if (encoded.length >= bytes.length) return keep('animated WebP is not smaller')
  const decoded = await sharp(encoded, { animated: true }).metadata()
  if (!timing(metadata, decoded)) return keep('animated WebP changed frame timing or geometry')
  const before = await pixels(bytes, visible),
    after = await pixels(encoded, visible)
  if (before !== after) return keep('animated WebP changed decoded frame pixels')
  const hash = createHash('sha256').update(encoded).digest('hex'),
    name = `${stem}-animated-${hash.slice(0, 20)}.webp`
  return {
    ...baseline,
    asset: {
      ...baseline.asset,
      animated: true,
      duration: metadata.delay.reduce((sum, delay) => sum + delay, 0) / 1000,
      sources: [
        { type: 'image/webp', srcset: `${name} ${metadata.width}w` },
        { type: original.type, srcset: `${original.src} ${metadata.width}w` },
      ],
    },
    files: [...baseline.files, { name, bytes: encoded }],
    verification: {
      selected: 'animated-webp',
      pixels: mode,
      frameCount: metadata.pages,
      timing: 'unchanged',
      decodedSha256: before,
      playbackBytes: encoded.length,
      originalBytes: bytes.length,
    },
  }
}
