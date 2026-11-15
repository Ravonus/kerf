import { afterEach, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { createMediaBuild } from '../src/build.mjs'
import { createMediaEncode } from '@kerf-js/media-ffmpeg/build'

const temporary: string[] = []
const folder = () => {
  const path = mkdtempSync(join(tmpdir(), 'kerf-frame-test-'))
  temporary.push(path)
  return path
}
afterEach(() =>
  temporary.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })),
)

it('lossless rasters retain original bytes and every resized RGBA byte including invisible RGB', async () => {
  const width = 12,
    height = 8,
    rgba = Buffer.alloc(width * height * 4)
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = i % 251
    rgba[i + 1] = 93
    rgba[i + 2] = 247
    rgba[i + 3] = i % 12 ? 255 : 0
  }
  const bytes = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer()
  const built = await createMediaBuild({
    formats: ['webp', 'avif'],
    widths: [6, 12],
    quality: { lossless: true },
    encoder: 'compatible',
    swap: 'manual',
  }).build({ file: '/fixture.png', bytes }, { cacheDir: folder() })
  const file = (name: string) =>
    built.files.find((value: { name: string }) => value.name === name)!.bytes
  expect(Buffer.from(file(built.asset.original.src))).toEqual(bytes)
  expect(built.asset.swap).toBe('manual')
  for (const source of built.asset.sources.slice(0, -1))
    for (const entry of source.srcset.split(', ')) {
      const [name, size] = entry.split(' '),
        expected = await sharp(bytes)
          .resize({ width: parseInt(size) })
          .ensureAlpha()
          .raw()
          .toBuffer()
      expect(Buffer.from(await sharp(file(name)).ensureAlpha().raw().toBuffer())).toEqual(expected)
    }
})

it('every efficient picture format contains the complete responsive width ladder', async () => {
  const bytes = await sharp({
    create: { width: 64, height: 48, channels: 4, background: '#ff94b2' },
  })
    .png({ compressionLevel: 0 })
    .toBuffer()
  const built = await createMediaBuild({
    formats: ['avif', 'webp'],
    widths: [8, 16, 32],
    quality: { lossless: true },
  }).build({ file: '/ladder.png', bytes }, { cacheDir: folder() })
  expect(built.verification.selected).toBe('raster')
  expect(built.asset.sources.at(-1).srcset.split(' ').at(-1)).toBe('64w')
  expect(
    built.asset.sources[0].srcset
      .split(', ')
      .map((entry: string) => parseInt(entry.split(' ')[1]!)),
  ).toEqual([8, 16, 32])
  for (const entry of built.asset.sources[0].srcset.split(', ')) {
    const [name, size] = entry.split(' ')
    const encoded = built.files.find((file: { name: string }) => file.name === name)!.bytes
    expect(await sharp(encoded).ensureAlpha().raw().toBuffer()).toEqual(
      await sharp(bytes)
        .resize({ width: parseInt(size) })
        .ensureAlpha()
        .raw()
        .toBuffer(),
    )
  }
})

it('keeps an already compact original instead of delivering a larger exact raster', async () => {
  let seed = 1
  const pixels = Uint8Array.from({ length: 64 * 48 * 3 }, () => {
    seed = Math.imul(seed, 1664525) + 1013904223
    return seed >>> 24
  })
  const bytes = await sharp(pixels, { raw: { width: 64, height: 48, channels: 3 } })
    .jpeg({ quality: 35 })
    .toBuffer()
  const built = await createMediaBuild({
    formats: ['avif', 'webp'],
    widths: [16, 32, 64],
    quality: { lossless: true },
  }).build({ file: '/compact.jpg', bytes }, { cacheDir: folder() })
  expect(built.verification.selected).toBe('original')
  expect(built.asset.sources).toEqual([
    { type: 'image/jpeg', srcset: `${built.asset.original.src} 64w` },
  ])
})

it('AVIF originals retain their real MIME type even when the decoder calls their container HEIF', async () => {
  const bytes = await sharp({
    create: { width: 4, height: 4, channels: 4, background: '#ff94b2' },
  })
    .avif({ lossless: true })
    .toBuffer()
  const built = await createMediaBuild({ quality: { lossless: true } }).build(
    { file: '/fixture.avif', bytes },
    { cacheDir: folder() },
  )
  expect(built.asset.original.type).toBe('image/avif')
  expect(built.asset.original.src).toMatch(/\.avif$/)
})

it('frame chunks reconstruct the entire native decode, preserve variable media times and stream-copy audio', async () => {
  const root = folder(),
    input = join(root, 'original.mp4')
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=32x24:rate=8:duration=1',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=1',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-threads',
    '2',
    input,
  ])
  const bytes = new Uint8Array(readFileSync(input)),
    encoder = createMediaEncode({ key: 'video/h264' })
  const built = await createMediaBuild({
    formats: ['webp'],
    video: { delivery: 'frames', chunkSeconds: 0.25, maxFrameBytes: 1000000 },
    quality: { lossless: true },
    swap: 'manual',
  }).build(
    { file: input, bytes },
    { cacheDir: join(root, 'cache'), encode: { 'video/h264': encoder } },
  )
  expect(built.diagnostics).toEqual([])
  expect(built.asset.frames.chunks).toHaveLength(4)
  const files = new Map<string, Uint8Array>(
    built.files.map((file: { name: string; bytes: Uint8Array }) => [file.name, file.bytes]),
  )
  expect(files.get(built.asset.original.src)).toEqual(bytes)
  await verifyReconstruction(built.asset.frames.chunks, files, input)
  const audio = join(root, 'audio.m4a')
  writeFileSync(audio, files.get(built.asset.frames.audio.src)!)
  const hash = (path: string) =>
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-i',
      path,
      '-map',
      '0:a:0',
      '-c:a',
      'copy',
      '-f',
      'hash',
      '-hash',
      'sha256',
      'pipe:1',
    ])
      .toString()
      .trim()
  expect(hash(audio)).toBe(hash(input))
})

it('automatic frame delivery reports measured growth and keeps the exact original rather than claiming a size win', async () => {
  const root = folder(),
    input = join(root, 'source.mp4')
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=64x48:rate=8:duration=1',
    '-c:v',
    'libx264',
    '-crf',
    '40',
    '-threads',
    '2',
    input,
  ])
  const bytes = new Uint8Array(readFileSync(input)),
    encoder = createMediaEncode({ key: 'video/h264' })
  const built = await createMediaBuild({
    formats: ['webp'],
    video: { delivery: 'auto', chunkSeconds: 0.25, maxFrameBytes: 200 },
    quality: { lossless: true },
  }).build(
    { file: input, bytes },
    { cacheDir: join(root, 'cache'), encode: { 'video/h264': encoder } },
  )
  expect(built.asset.frames).toBeUndefined()
  expect(built.verification.selected).toBe('original')
  expect(
    built.files.find((file: { name: string }) => file.name === built.asset.original.src)!.bytes,
  ).toEqual(bytes)
  expect(built.diagnostics[0].code).toBe('M020')
})

it('keeps native playback when image delivery cannot preserve an authored audio start offset', async () => {
  const root = folder(),
    input = join(root, 'offset.mp4')
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=s=32x24:r=4:d=1',
    '-itsoffset',
    '0.5',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=1',
    '-c:v',
    'libx264',
    '-c:a',
    'aac',
    '-threads',
    '2',
    input,
  ])
  const bytes = new Uint8Array(readFileSync(input)),
    encoder = createMediaEncode({ key: 'video/h264' })
  expect((await encoder.info(input)).audio.start).toBeGreaterThan(0.4)
  const built = await createMediaBuild({
    formats: ['webp'],
    quality: { lossless: true },
    video: { delivery: 'auto', codecs: [] },
  }).build(
    { file: input, bytes },
    { cacheDir: join(root, 'cache'), encode: { 'video/h264': encoder } },
  )
  expect(built.asset.frames).toBeUndefined()
  expect(
    built.diagnostics.some((item: { message: string }) => item.message.includes('start offset')),
  ).toBe(true)
  expect(
    built.files.find((file: { name: string }) => file.name === built.asset.original.src)?.bytes,
  ).toEqual(bytes)
})

async function verifyReconstruction(
  chunks: { src: string }[],
  files: Map<string, Uint8Array>,
  input: string,
) {
  const reference = execFileSync('ffmpeg', [
    '-v',
    'error',
    '-i',
    input,
    '-map',
    '0:v:0',
    '-pix_fmt',
    'rgba',
    '-f',
    'rawvideo',
    'pipe:1',
  ])
  let index = 0
  for (const entry of chunks) {
    const encoded = files.get(entry.src)
    if (!encoded) throw new Error('Missing frame chunk')
    const chunk = JSON.parse(new TextDecoder().decode(encoded)),
      canvas = Buffer.alloc(32 * 24 * 4)
    expect(chunk.frames[0]).toMatchObject({ x: 0, y: 0, width: 32, height: 24 })
    for (const frame of chunk.frames) {
      if (frame.src) {
        const imageBytes = files.get(frame.src)
        if (!imageBytes) throw new Error('Missing frame image')
        const patch = await sharp(imageBytes).ensureAlpha().raw().toBuffer()
        for (let y = 0; y < frame.height; y++)
          patch.copy(
            canvas,
            ((frame.y + y) * 32 + frame.x) * 4,
            y * frame.width * 4,
            (y + 1) * frame.width * 4,
          )
      }
      expect(canvas).toEqual(reference.subarray(index * 32 * 24 * 4, (index + 1) * 32 * 24 * 4))
      expect(frame.time).toBeCloseTo(index / 8, 6)
      expect(frame.duration).toBeCloseTo(1 / 8, 6)
      index++
    }
  }
  expect(index).toBe(8)
}

it('optimizes an animated GIF only with complete frame/timing verification and retains exact original bytes', async () => {
  const raw = Buffer.alloc(16 * 16 * 3 * 3)
  for (let frame = 0; frame < 3; frame++)
    for (let pixel = 0; pixel < 16 * 16; pixel++) raw[(frame * 16 * 16 + pixel) * 3 + frame] = 255
  const gif = await sharp(raw, { raw: { width: 16, height: 48, channels: 3, pageHeight: 16 } })
    .gif({ delay: [40, 80, 120], loop: 2 })
    .toBuffer()
  // Legal GIF comments model source overhead without changing any frame.
  const blocks = Array.from({ length: 12 }, () =>
    Buffer.concat([Buffer.from([255]), Buffer.alloc(255, 65)]),
  )
  const bytes = Buffer.concat([
    gif.subarray(0, -1),
    Buffer.from([0x21, 0xfe]),
    ...blocks,
    Buffer.from([0, 0x3b]),
  ])
  const built = await createMediaBuild({
    quality: { lossless: true },
    video: { lossless: false },
    encoder: 'compatible',
    swap: 'manual',
  }).build({ file: '/animation.gif', bytes }, { cacheDir: folder() })
  expect(built.verification).toMatchObject({
    selected: 'animated-webp',
    pixels: 'visible-rgba',
    frameCount: 3,
    timing: 'unchanged',
  })
  expect(built.verification.playbackBytes).toBeLessThan(bytes.length)
  expect(
    built.files.find((file: { name: string }) => file.name === built.asset.original.src)?.bytes,
  ).toEqual(bytes)
  const webp = built.files.find((file: { name: string }) => file.name.endsWith('.webp'))!
  const meta = await sharp(webp.bytes, { animated: true }).metadata()
  expect(meta.pages).toBe(3)
  expect(meta.delay).toEqual([40, 80, 120])
  expect(meta.loop).toBe(2)
})
