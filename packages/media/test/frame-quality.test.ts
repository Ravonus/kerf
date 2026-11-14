// Real perceptual scores need the optional libjxl CLI; exact playback remains available without it.
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import sharp from 'sharp'
import { afterEach, expect, it } from 'vitest'
import { measuredFrame } from '../src/frame-quality.mjs'
import { createMediaBuild, findScorer } from '../src/build.mjs'
import { createMediaEncode } from '@kerf-js/media-ffmpeg/build'

const scorer = findScorer('ssimulacra2'),
  ffmpeg = !spawnSync('ffmpeg', ['-version']).error
const folders: string[] = []
const folder = () => {
  const dir = mkdtempSync(join(tmpdir(), 'kerf-perceptual-'))
  folders.push(dir)
  return dir
}
afterEach(() => folders.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })))

const reference = () =>
  Buffer.from(
    Array.from({ length: 64 * 64 * 4 }, (_, i) =>
      i % 4 === 3 ? 255 : ((i >> 2) * 13 + (i % 4) * 47) % 256,
    ),
  )
async function score(dir: string, ref: Buffer, actual: Buffer) {
  for (const [name, data] of [
    ['independent-reference', ref],
    ['independent-result', actual],
  ] as const)
    writeFileSync(
      join(dir, name + '.png'),
      await sharp(data, { raw: { width: 64, height: 64, channels: 4 } })
        .png()
        .toBuffer(),
    )
  return Number.parseFloat(
    execFileSync(
      scorer,
      [join(dir, 'independent-reference.png'), join(dir, 'independent-result.png')],
      { encoding: 'utf8' },
    ),
  )
}

it.runIf(!!scorer)(
  'scores the full reconstruction, including errors outside a changed patch',
  async () => {
    const dir = folder(),
      rgba = reference(),
      geometry = {
        width: 64,
        height: 64,
        rect: { x: 0, y: 0, width: 64, height: 64 },
        stem: 'frame',
      }
    const first = await measuredFrame(
      { ...geometry, reference: rgba },
      { formats: ['webp'], target: 90, scorer },
      dir,
    )
    expect(await score(dir, rgba, first.reconstructed)).toBeGreaterThanOrEqual(90)
    const next = Buffer.from(rgba)
    for (let y = 10; y < 18; y++) for (let x = 10; x < 18; x++) next[(y * 64 + x) * 4] = 200
    const second = await measuredFrame(
      {
        ...geometry,
        rect: { x: 10, y: 10, width: 8, height: 8 },
        reference: next,
        previous: first.reconstructed,
      },
      { formats: ['webp'], target: 90, scorer },
      dir,
    )
    expect(await score(dir, next, second.reconstructed)).toBeGreaterThanOrEqual(90)
  },
)

it.runIf(!!scorer)(
  'an AVIF fallback reconstructs identical pixels, avoiding browser-dependent patch drift',
  async () => {
    const dir = folder(),
      rgba = reference()
    const output = await measuredFrame(
      {
        reference: rgba,
        width: 64,
        height: 64,
        rect: { x: 0, y: 0, width: 64, height: 64 },
        stem: 'frame',
      },
      { formats: ['avif'], target: 90, scorer },
      dir,
    )
    expect(output.files[0]!.type).toBe('image/avif')
    expect(output.files).toHaveLength(2)
    const pixels = await Promise.all(
      output.files.map((file) => sharp(file.bytes).ensureAlpha().raw().toBuffer()),
    )
    expect(pixels[0]).toEqual(pixels[1])
  },
)

function movie(dir: string) {
  const file = join(dir, 'source.mp4')
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=64x64:rate=4:duration=0.5',
    '-c:v',
    'libx264',
    '-threads',
    '2',
    file,
  ])
  return { file, bytes: new Uint8Array(readFileSync(file)) }
}

it.runIf(!!scorer && ffmpeg)(
  'perceptual playback is labeled with measured scores and retains the exact original',
  async () => {
    const dir = folder(),
      source = movie(dir)
    const built = await createMediaBuild({
      formats: ['webp'],
      quality: { lossless: true, target: 90 },
      video: { delivery: 'frames', lossless: false },
    }).build(source, {
      cacheDir: join(dir, 'cache'),
      encode: { 'video/h264': createMediaEncode({ key: 'video/h264' }) },
    })
    expect(built.diagnostics).toEqual([])
    expect(built.asset.frames.pixels).toBe('perceptual')
    expect(built.asset.frames.quality.minimum).toBeGreaterThanOrEqual(90)
    expect(
      built.files.find((file: { name: string }) => file.name === built.asset.original.src)!.bytes,
    ).toEqual(source.bytes)
  },
)

it.runIf(ffmpeg)('does not call an unmeasured fixed-quality recipe visually lossless', async () => {
  const dir = folder(),
    source = movie(dir)
  const built = await createMediaBuild({
    quality: { scorer: 'none' },
    video: { delivery: 'auto', lossless: false },
  }).build(source, {
    cacheDir: join(dir, 'cache'),
    encode: { 'video/h264': createMediaEncode({ key: 'video/h264' }) },
  })
  expect(built.asset.frames).toBeUndefined()
  expect(built.diagnostics[0].code).toBe('M020')
  expect(built.verification.selected).toBe('original')
})
