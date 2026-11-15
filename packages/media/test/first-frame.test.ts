import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, expect, it } from 'vitest'
import { createFirstFrameBuild } from '../src/build.mjs'
import { createMediaEncode } from '@kerf-js/media-ffmpeg/build'
const folders: string[] = []
afterEach(() => folders.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))
// Actual source-frame identity and cache behavior need the optional FFmpeg provider.
it.runIf(!spawnSync('ffmpeg', ['-version']).error)(
  'uses the actual first frame, emits sharp responsive stills and caches them without blur',
  async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-first-frame-test-'))
    folders.push(dir)
    for (const [name, color] of [
      ['one', 'red'],
      ['two', 'blue'],
    ])
      writeFileSync(
        join(dir, name + '.png'),
        await sharp({ create: { width: 64, height: 48, channels: 4, background: color! } })
          .png()
          .toBuffer(),
      )
    const file = join(dir, 'source.mp4')
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-loop',
      '1',
      '-t',
      '1',
      '-i',
      join(dir, 'one.png'),
      '-loop',
      '1',
      '-t',
      '1',
      '-i',
      join(dir, 'two.png'),
      '-filter_complex',
      '[0:v][1:v]concat=n=2:v=1:a=0',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-threads',
      '2',
      file,
    ])
    const enc = createMediaEncode({ key: 'video/h264' }),
      original = enc.still
    let reads = 0
    enc.still = (...args: Parameters<typeof original>) => {
      reads++
      return original(...args)
    }
    const builder = createFirstFrameBuild({ widths: [32, 64] }),
      ctx = { cacheDir: join(dir, 'cache'), encode: { 'video/h264': enc } }
    const built = await builder.build({ file }, ctx),
      cached = await builder.build({ file }, ctx)
    expect(reads).toBe(1)
    expect(cached.asset).toEqual(built.asset)
    expect(built.verification).toMatchObject({
      frameTime: 0,
      pixels: 'exact',
      placeholder: 'none',
      widths: [32, 64],
    })
    expect(built.asset.placeholder).toBeUndefined()
    const fallback = built.files.find(
      (output: { name: string }) => output.name === built.asset.src,
    )!
    expect(await sharp(fallback.bytes).ensureAlpha().raw().toBuffer()).toEqual(
      await sharp(await original(file, { at: 0 }))
        .ensureAlpha()
        .raw()
        .toBuffer(),
    )
    for (const source of built.asset.sources)
      expect(
        source.srcset.split(', ').map((entry: string) => Number.parseInt(entry.split(' ')[1]!)),
      ).toEqual([32, 64])
  },
  30000,
)

// Perceptual qualification is available only with the optional real SSIMULACRA2 CLI.
it.runIf(!spawnSync('ffmpeg', ['-version']).error && !spawnSync('ssimulacra2', []).error)(
  'qualifies every emitted sharp first-frame rendition at the requested perceptual floor',
  async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-first-frame-quality-'))
    folders.push(dir)
    const file = join(dir, 'source.mp4')
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=s=64x48:r=4:d=0.5',
      '-c:v',
      'libx264',
      '-threads',
      '2',
      file,
    ])
    const out = await createFirstFrameBuild({ widths: [32, 64], target: 90 }).build(
      { file },
      {
        cacheDir: join(dir, 'cache'),
        encode: { 'video/h264': createMediaEncode({ key: 'video/h264' }) },
      },
    )
    expect(out.asset.quality).toBe('ssimulacra2')
    for (const rung of out.verification.scores)
      for (const format of out.asset.sources.map(
        (source: { type: string }) => source.type.split('/')[1],
      ))
        if (format !== 'png') expect(rung[format]).toBeGreaterThanOrEqual(90)
    expect(out.asset.placeholder).toBeUndefined()
  },
  30000,
)
