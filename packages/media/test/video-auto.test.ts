import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it } from 'vitest'
import { selectVideoDelivery } from '../src/video-auto.mjs'
import { createMediaBuild, findScorer } from '../src/build.mjs'
import { createMediaEncode } from '@kerf-js/media-ffmpeg/build'

const folders: string[] = []
afterEach(() => folders.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))
function output(bytes: number, frames = false, fallback = 0) {
  return {
    asset: {
      src: 'source.mp4',
      type: 'video/mp4',
      width: 64,
      height: 48,
      sources: [],
      original: { src: 'source.mp4', bytes: 500000 },
      ...(frames && { frames: { version: 1, chunks: [{ src: 'chunk.json' }] } }),
    },
    files: [
      { name: 'source.mp4', bytes: new Uint8Array(500000) },
      { name: frames ? 'frames.webp' : 'native.mp4', bytes: new Uint8Array(bytes) },
      ...(fallback ? [{ name: 'fallback.webp', bytes: new Uint8Array(fallback) }] : []),
    ],
    verification: { selected: frames ? 'frames' : 'native', playbackBytes: bytes },
    diagnostics: [],
  }
}

it('keeps native video when frames are larger, tied, or save less than their player budget', () => {
  for (const bytes of [100001, 100000, 50000])
    expect(selectVideoDelivery(output(100000), output(bytes, true)).verification.selected).toBe(
      'native',
    )
})

it('includes compatibility fallbacks in the cost and never serves rejected frame artifacts', () => {
  const native = output(150000),
    frames = output(40000, true, 60000),
    selected = selectVideoDelivery(native, frames)
  expect(selected.verification.selected).toBe('native')
  expect(selected.files.some((file: { name: string }) => file.name === 'frames.webp')).toBe(false)
  expect(selected.verification.selection.frames.encodedBytes).toBe(100000)
  expect(selected.verification.selection.frames.decodeCpu).toBe('unmeasured')
})

it('selects frames only for a real payload and conservative delivery-cost win, retaining the exact source', () => {
  const selected = selectVideoDelivery(output(300000), output(40000, true, 50000))
  expect(selected.verification.selected).toBe('frames')
  expect(selected.verification.selection.reason).toContain('lower delivery byte cost')
  expect(
    selected.files.find((file: { name: string }) => file.name === 'source.mp4')?.bytes,
  ).toHaveLength(500000)
})

// These checks use actual local encoders; installations without FFmpeg still run all selection contracts.
it.runIf(!spawnSync('ffmpeg', ['-version']).error)(
  'automatically selects a smaller container without changing a single encoded sample or original byte',
  async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-video-auto-'))
    folders.push(dir)
    const file = join(dir, 'padded.mp4')
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=s=64x48:r=4:d=1',
      '-c:v',
      'libx264',
      '-threads',
      '2',
      file,
    ])
    // A legal trailing free box models a needlessly large container without changing media samples.
    const box = Buffer.alloc(200000)
    box.writeUInt32BE(box.length)
    box.write('free', 4)
    const bytes = Buffer.concat([readFileSync(file), box])
    writeFileSync(file, bytes)
    const built = await createMediaBuild({
      formats: ['webp'],
      quality: { lossless: true },
      video: { delivery: 'auto', codecs: [] },
      swap: 'manual',
    }).build(
      { file, bytes },
      {
        cacheDir: join(dir, 'cache'),
        encode: { 'video/h264': createMediaEncode({ key: 'video/h264' }) },
      },
    )
    expect(built.verification.selected).toBe('native')
    expect(built.verification.video).toBe('identical encoded samples')
    expect(built.verification.frameCount).toBe(4)
    expect(built.verification.nativeCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ codec: 'video/h264', mode: 'container', status: 'qualified' }),
        expect.objectContaining({
          codec: 'video/h264',
          mode: 'encode',
          status: 'encoding policy or scorer unavailable',
        }),
      ]),
    )
    expect(built.verification.playbackBytes).toBeLessThan(bytes.length / 10)
    expect(
      built.files.find((entry: { name: string }) => entry.name === built.asset.original.src)?.bytes,
    ).toEqual(bytes)
    expect(built.asset.frames).toBeUndefined()
  },
  30000,
)

// A scorer is required: a fixed CRF must never masquerade as visually lossless playback.
it.runIf(!!findScorer('ssimulacra2') && !spawnSync('ffmpeg', ['-version']).error)(
  'qualifies a smaller native codec at the requested score while retaining the original',
  async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-video-quality-'))
    folders.push(dir)
    const file = join(dir, 'source.mov')
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=pink:s=64x48:r=4:d=1',
      '-c:v',
      'ffv1',
      '-metadata',
      'comment=' + 'original'.repeat(10000),
      '-threads',
      '2',
      file,
    ])
    const bytes = new Uint8Array(readFileSync(file)),
      built = await createMediaBuild({
        formats: ['webp'],
        quality: { lossless: true, target: 90 },
        video: { delivery: 'auto', lossless: false, codecs: [] },
        swap: 'manual',
      }).build(
        { file, bytes },
        {
          cacheDir: join(dir, 'cache'),
          encode: { 'video/h264': createMediaEncode({ key: 'video/h264' }) },
        },
      )
    expect(
      built.verification.selected,
      JSON.stringify({ diagnostics: built.diagnostics, verification: built.verification }),
    ).toBe('native')
    expect(built.verification.quality).toMatchObject({
      metric: 'ssimulacra2',
      target: 90,
      samples: 5,
      passed: true,
    })
    expect(built.verification.quality.minimum).toBeGreaterThanOrEqual(90)
    expect(built.asset.quality).toBe('ssimulacra2')
    expect(
      built.files.find((entry: { name: string }) => entry.name === built.asset.original.src)?.bytes,
    ).toEqual(bytes)
  },
  60000,
)
