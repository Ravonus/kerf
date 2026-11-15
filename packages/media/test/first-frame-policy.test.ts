// The standard import and upload paths must both use the explicitly selected preview quality.
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import sharp from 'sharp'
import { afterEach, expect, it } from 'vitest'
import { videoFirstFrame } from '../src/video-first-frame.mjs'
import { uploadFirstFrame } from '../src/upload/first-frame.mjs'
import { createUpgrade } from '../src/upload/upgrade.mjs'
const folders: string[] = []
afterEach(() => folders.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))
it('uses the same quality target for imports and uploads, retaining the original bytes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kerf-preview-policy-'))
  folders.push(dir)
  const file = join(dir, 'source.mp4'),
    bytes = Buffer.from('original source bytes')
  writeFileSync(file, bytes)
  const png = await sharp({ create: { width: 32, height: 24, channels: 4, background: 'red' } })
    .png()
    .toBuffer()
  const encode = {
    'video/h264': {
      info: () => Promise.resolve({ video: { width: 32, height: 24 } }),
      still: () => Promise.resolve(png),
      versions: () => Promise.resolve({ test: 1 }),
    },
  }
  const o = {
    video: { widths: [32], firstFrameQuality: { target: 90, scorer: 'missing-kerf-test-scorer' } },
  }
  const original = { name: 'source.mp4', bytes },
    out = { asset: { kind: 'video' }, files: [] }
  const imported = await videoFirstFrame(original, out, o, { cacheDir: join(dir, 'cache'), encode })
  expect(imported.asset.firstFrame).toMatchObject({ target: 100, pixels: 'exact' })
  expect(imported.verification.firstFrame.target).toBe(100)
  expect(
    imported.files.find((f: { name: string }) => f.name === imported.asset.original.src)?.bytes,
  ).toEqual(bytes)
  // Missing scoring safely retains exact pixels; it must never claim a measured target was met.
  const hash = 'hash'
  writeFileSync(join(dir, 'marker'), '')
  const { mkdirSync } = await import('node:fs')
  mkdirSync(join(dir, hash))
  const uploaded = await uploadFirstFrame({
    file,
    dir,
    hash,
    o,
    encode,
    url: (_hash: string, width: number, format: string) => `/media/${width}.${format}`,
  })
  expect(uploaded.asset.firstFrame).toMatchObject({ target: 100, pixels: 'exact' })
  expect(readFileSync(file)).toEqual(bytes)
})
it('re-ingests an existing exact preview after an explicit measured policy change', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kerf-preview-upgrade-'))
  folders.push(dir)
  const file = join(dir, 'source.mp4')
  writeFileSync(file, 'source')
  const png = await sharp({ create: { width: 16, height: 16, channels: 4, background: 'blue' } })
    .png()
    .toBuffer()
  const { mkdirSync } = await import('node:fs')
  mkdirSync(join(dir, 'hash'))
  let reads = 0
  const upgrade = createUpgrade({
    sourceOf: () => file,
    dir,
    o: {
      video: {
        widths: [16],
        firstFrameQuality: { target: 90, scorer: 'missing-kerf-test-scorer' },
      },
    },
    encode: {
      'video/h264': {
        info: () => Promise.resolve({ video: { width: 16, height: 16 } }),
        still: () => {
          reads++
          return Promise.resolve(png)
        },
        versions: () => Promise.resolve({ test: 1 }),
      },
    },
    url: () => '/media',
    store: (_hash: unknown, _source: unknown, asset: unknown) => Promise.resolve(asset),
  })
  await upgrade('hash', {
    asset: {
      kind: 'video',
      name: 'source.mp4',
      original: { src: '/source' },
      firstFrame: { pixels: 'exact', target: 100 },
    },
  })
  expect(reads).toBe(1)
})

// The real scorer is optional locally; first-frame.test.ts separately verifies reconstructed pixels.
it.runIf(!(await import('node:child_process')).spawnSync('ssimulacra2', []).error)(
  'passes an explicit measured target through both standard paths',
  async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-measured-policy-'))
    folders.push(dir)
    const file = join(dir, 'source.mp4'),
      bytes = Buffer.from('retained original')
    writeFileSync(file, bytes)
    const png = await sharp({ create: { width: 32, height: 24, channels: 4, background: 'red' } })
      .png()
      .toBuffer()
    const encode = {
      'video/h264': {
        info: () => Promise.resolve({ video: { width: 32, height: 24 } }),
        still: () => Promise.resolve(png),
        versions: () => Promise.resolve({ test: 1 }),
      },
    }
    const o = { video: { widths: [32], firstFrameQuality: { target: 90 } } }
    const out = await videoFirstFrame(
      { name: 'source.mp4', bytes },
      { asset: { kind: 'video' }, files: [] },
      o,
      { cacheDir: join(dir, 'cache'), encode },
    )
    expect(out.asset.firstFrame).toMatchObject({ pixels: 'perceptual', target: 90 })
    expect(out.verification.firstFrame.target).toBe(90)
    const { mkdirSync } = await import('node:fs')
    mkdirSync(join(dir, 'hash'))
    const uploaded = await uploadFirstFrame({
      file,
      dir,
      hash: 'hash',
      o,
      encode,
      url: () => '/media',
    })
    expect(uploaded.asset.firstFrame).toMatchObject({ pixels: 'perceptual', target: 90 })
  },
)
