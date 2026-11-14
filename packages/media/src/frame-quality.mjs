// Score the complete reconstructed frame, so unchanged regions cannot silently accumulate patch errors.
import sharp from 'sharp'
import { execFile } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { losslessImages, pixelHash } from './lossless.mjs'

const run = promisify(execFile)

function overlay(previous, patch, geometry) {
  const { width, height, rect } = geometry
  const result = previous ? Buffer.from(previous) : Buffer.alloc(width * height * 4)
  for (let y = 0; y < rect.height; y++)
    patch.copy(
      result,
      ((rect.y + y) * width + rect.x) * 4,
      y * rect.width * 4,
      (y + 1) * rect.width * 4,
    )
  return result
}

async function trial(context, options, recipe) {
  const image = sharp(context.raw, {
    raw: { width: context.rect.width, height: context.rect.height, channels: 4 },
  })
  const encoded = await (
    recipe.format === 'avif'
      ? image.avif({ quality: recipe.quality, effort: 4, chromaSubsampling: '4:4:4' })
      : image.webp({ quality: recipe.quality, effort: 4, alphaQuality: 100 })
  ).toBuffer()
  const decoded = await sharp(encoded).ensureAlpha().raw().toBuffer()
  const reconstructed = overlay(context.previous, decoded, context)
  const candidate = join(context.dir, 'frame-candidate.png')
  await writeFile(
    candidate,
    await sharp(reconstructed, {
      raw: { width: context.width, height: context.height, channels: 4 },
    })
      .png({ compressionLevel: 0 })
      .toBuffer(),
  )
  const { stdout } = await run(
    options.scorer,
    [join(context.dir, 'frame-reference.png'), candidate],
    { timeout: 30000, maxBuffer: 4096 },
  )
  const score = Number.parseFloat(stdout)
  if (!Number.isFinite(score))
    throw new Error('The frame quality scorer did not return a finite score')
  return {
    score,
    decoded,
    reconstructed,
    file: {
      name: `${context.stem}-${pixelHash(encoded).slice(0, 20)}.${recipe.format}`,
      type: `image/${recipe.format}`,
      bytes: new Uint8Array(encoded),
    },
  }
}

async function search(context, options, format) {
  let low = 35,
    high = 100,
    best
  for (let step = 0; step < 6 && low <= high; step++) {
    const quality = Math.floor((low + high) / 2)
    const candidate = await trial(context, options, { format, quality })
    if (candidate.score >= options.target) {
      best = candidate
      high = quality - 1
    } else low = quality + 1
  }
  if (!best) {
    const candidate = await trial(context, options, { format, quality: 100 })
    if (candidate.score >= options.target) best = candidate
  }
  return best
}

/** Every returned frame meets the requested SSIMULACRA2 floor after patch reconstruction. */
export async function measuredFrame(input, options, dir) {
  const reference = await sharp(input.reference, {
    raw: { width: input.width, height: input.height, channels: 4 },
  })
    .png({ compressionLevel: 0 })
    .toBuffer()
  await writeFile(join(dir, 'frame-reference.png'), reference)
  const raw = await sharp(input.reference, {
    raw: { width: input.width, height: input.height, channels: 4 },
  })
    .extract({
      left: input.rect.x,
      top: input.rect.y,
      width: input.rect.width,
      height: input.rect.height,
    })
    .raw()
    .toBuffer()
  const context = { ...input, raw, dir }
  const candidates = []
  for (const format of options.formats) {
    const candidate = await search(context, options, format)
    if (candidate) candidates.push(candidate)
  }
  candidates.sort((a, b) => a.file.bytes.length - b.file.bytes.length)
  const selected = candidates[0]
  if (!selected) {
    const files = await losslessImages(
      Buffer.from(input.reference),
      input.width,
      input.height,
      options.formats,
      input.stem,
    )
    return {
      rect: { x: 0, y: 0, width: input.width, height: input.height },
      files,
      reconstructed: Buffer.from(input.reference),
      score: 100,
    }
  }
  const files = [selected.file]
  if (selected.file.type === 'image/avif') {
    const fallback = await losslessImages(
      selected.decoded,
      input.rect.width,
      input.rect.height,
      ['webp'],
      input.stem + '-fallback',
    )
    files.push(
      fallback.find((file) => file.type === 'image/webp') ??
        fallback.find((file) => file.type === 'image/png'),
    )
  }
  return { rect: input.rect, files, reconstructed: selected.reconstructed, score: selected.score }
}
