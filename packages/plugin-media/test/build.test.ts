// media.build@1 on real encodes (sharp 0.35, libjxl's ssimulacra2 when installed): the ladder, the quality search,
// the fallback per source kind, EXIF orientation, SVG safety, animated GIFs and the cache.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMediaBuild, findScorer } from '../src/build.mjs'
import { FIXED } from '../src/shared.mjs'
import { media } from '../src/index.mjs'

/** A photo-like test image: gradients plus fine texture, softened like a lens (pure pixel noise is the one case
 * research 15 found AVIF losing, and no camera produces it). */
async function photo(
  width: number,
  height: number,
  { orientation, format = 'jpeg' }: { orientation?: number; format?: string } = {},
) {
  const px = Buffer.alloc(width * height * 3)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3
      const n = ((x * 7919) ^ (y * 104729)) % 23 // deterministic texture
      px[i] = (x / width) * 220 + n
      px[i + 1] = (y / height) * 200 + ((x >> 4) % 2) * 20
      px[i + 2] = 120 + Math.sin(x / 9) * 60 + Math.cos(y / 13) * 40
    }
  }
  let img = sharp(px, { raw: { width, height, channels: 3 } })
  img = format === 'png' ? img.ensureAlpha(0.5).png() : img.blur(0.6).jpeg({ quality: 92 })
  if (orientation) img = img.withMetadata({ orientation })
  return new Uint8Array(await img.toBuffer())
}

const scorer = findScorer('ssimulacra2')
let cacheDir: string
beforeEach(() => (cacheDir = mkdtempSync(join(tmpdir(), 'weft-media-'))))
afterEach(() => rmSync(cacheDir, { recursive: true, force: true }))

describe('photos', () => {
  registerScoredPhoto()

  it('without a scorer uses fixed qualities and says so', async () => {
    const { asset } = await createMediaBuild({
      widths: [320, 2560],
      quality: { scorer: 'none' },
    }).build({ file: '/x/a.jpg', bytes: await photo(400, 300) }, { cacheDir })
    expect(asset.quality).toBe('fixed')
    expect(asset.qualities).toEqual({ avif: FIXED.avif, jpeg: FIXED.jpeg })
    expect(asset.sources[0].srcset.split(', ').map((s: string) => s.split(' ')[1])).toEqual([
      '320w',
      '400w',
    ]) // never upscaled; intrinsic included
  })

  it('applies EXIF orientation: a portrait shot stored landscape', async () => {
    const { asset } = await createMediaBuild({ widths: [320], quality: { scorer: 'none' } }).build(
      { file: '/x/p.jpg', bytes: await photo(400, 300, { orientation: 6 }) },
      { cacheDir },
    )
    expect([asset.width, asset.height]).toEqual([300, 400])
  })

  it("placeholder: 'file' writes the placeholder as a file, for a CSP without data:", async () => {
    const { asset, files } = await createMediaBuild({
      widths: [320],
      quality: { scorer: 'none' },
      placeholder: 'file',
    }).build({ file: '/x/a.jpg', bytes: await photo(400, 300) }, { cacheDir })
    expect(asset.placeholder).toMatch(/^a-placeholder-[0-9a-f]{8}\.webp$/)
    const file = files.find((f: { name: string }) => f.name === asset.placeholder)
    expect((await sharp(file.bytes).metadata()).format).toBe('webp')
    expect(asset.dominant).toMatch(/^#[0-9a-f]{6}$/)
  })
})

function registerScoredPhoto() {
  // The search needs the libjxl `ssimulacra2` tool on PATH; without it the build falls back to FIXED, tested elsewhere.
  it.skipIf(!scorer)(
    'searches AVIF and JPEG to SSIMULACRA2 ≥ 80 at the largest width, then encodes the ladder',
    async () => {
      const bytes = await photo(1100, 700)
      const { asset, files } = await createMediaBuild({ widths: [320, 640, 1280] }).build(
        { file: '/x/hero.jpg', bytes },
        { cacheDir },
      )
      expect(asset).toMatchObject({
        kind: 'photo',
        width: 1100,
        height: 700,
        type: 'image/jpeg',
        name: 'hero.jpg',
        quality: 'ssimulacra2',
      })
      expect(asset.sources.map((s: { type: string }) => s.type)).toEqual([
        'image/avif',
        'image/jpeg',
      ])
      expect(asset.sources[0].srcset).toMatch(
        /^hero-320-[0-9a-f]{8}\.avif 320w, hero-640-[0-9a-f]{8}\.avif 640w, hero-1100-[0-9a-f]{8}\.avif 1100w$/,
      )
      expect(asset.src).toMatch(/^hero-1100-[0-9a-f]{8}\.jpg$/)
      expect(files).toHaveLength(6)
      expect(asset.dominant).toMatch(/^#[0-9a-f]{6}$/)
      expect(asset.placeholder).toMatch(/^data:image\/webp;base64,/)
      expect(asset.placeholder.length).toBeLessThan(400)

      // the chosen AVIF really scores ≥ 80 against the source at that width, and is smaller than the JPEG
      const dir = mkdtempSync(join(tmpdir(), 'weft-score-'))
      try {
        const avif = files.find(
          (f: { name: string; bytes: Uint8Array }) =>
            f.name.startsWith('hero-1100') && f.name.endsWith('.avif'),
        )
        const jpeg = files.find((f: { name: string; bytes: Uint8Array }) => f.name === asset.src)
        writeFileSync(join(dir, 'ref.png'), await sharp(bytes).png().toBuffer())
        writeFileSync(join(dir, 'avif.png'), await sharp(avif.bytes).png().toBuffer())
        expect(
          parseFloat(
            execFileSync(scorer, [join(dir, 'ref.png'), join(dir, 'avif.png')], {
              encoding: 'utf8',
            }),
          ),
        ).toBeGreaterThanOrEqual(80)
        expect(avif.bytes.length).toBeLessThan(jpeg.bytes.length)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }

      const t = performance.now()
      const again = await createMediaBuild({ widths: [320, 640, 1280] }).build(
        { file: '/x/hero.jpg', bytes },
        { cacheDir },
      )
      expect(performance.now() - t).toBeLessThan(200) // from the cache
      expect(again.asset).toEqual(asset)
      expect(again.files.map((f: { bytes: Uint8Array }) => f.bytes.length)).toEqual(
        files.map((f: { bytes: Uint8Array }) => f.bytes.length),
      )
    },
  )
}

it('a PNG with alpha is a graphic: AVIF plus a lossless PNG fallback', async () => {
  const { asset } = await createMediaBuild({ widths: [200], quality: { scorer: 'none' } }).build(
    { file: '/x/ui.png', bytes: await photo(300, 200, { format: 'png' }) },
    { cacheDir },
  )
  expect(asset).toMatchObject({ kind: 'graphic', type: 'image/png' })
  expect(asset.sources.map((s: { type: string }) => s.type)).toEqual(['image/avif', 'image/png'])
})

it('the cache keeps names apart: the same bytes under a new name come out under the new name', async () => {
  const bytes = await photo(240, 160)
  const build = createMediaBuild({ widths: [200], quality: { scorer: 'none' } })
  const first = await build.build({ file: '/x/old-name.jpg', bytes }, { cacheDir })
  const renamed = await build.build({ file: '/x/new-name.jpg', bytes }, { cacheDir })
  expect(first.asset.src).toMatch(/^old-name-/)
  expect(renamed.asset.src).toMatch(/^new-name-/)
  expect(renamed.files.every((f: { name: string }) => f.name.startsWith('new-name-'))).toBe(true)
})

it('SVG: unsafe files are refused (M012); safe ones go through SVGO with their size', async () => {
  const build = createMediaBuild()
  const evil = await build.build(
    {
      file: '/x/evil.svg',
      bytes: new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)"><script>x()</script></svg>',
      ),
    },
    { cacheDir },
  )
  expect(evil.asset).toBeNull()
  expect(evil.diagnostics).toEqual([
    {
      code: 'M012',
      severity: 'error',
      message: expect.stringContaining('<script>, an on* event handler'),
    },
  ])
  expect(readdirSync(cacheDir)).toEqual([]) // a refusal is never cached

  const icon =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">  <!-- c --> <path d="M 0 0 L 10 10"/></svg>'
  const ok = await build.build(
    { file: '/x/icon.svg', bytes: new TextEncoder().encode(icon) },
    { cacheDir },
  )
  expect(ok.asset).toMatchObject({
    kind: 'vector',
    width: 24,
    height: 24,
    type: 'image/svg+xml',
    sources: [],
  })
  expect(ok.files[0].bytes.length).toBeLessThan(icon.length)
  expect(new TextDecoder().decode(ok.files[0].bytes)).toContain('viewBox="0 0 24 24"')
})

it('an animated GIF ships as is, with M004 over the limit', async () => {
  const frame = (c: string) =>
    sharp({ create: { width: 40, height: 30, channels: 3, background: c } })
      .png()
      .toBuffer()
  const gif = new Uint8Array(
    await sharp([await frame('#f00'), await frame('#00f')], { join: { animated: true } })
      .gif()
      .toBuffer(),
  )
  const { asset, files, diagnostics } = await createMediaBuild({ gifLimit: 10 }).build(
    { file: '/x/spin.gif', bytes: gif },
    { cacheDir },
  )
  expect(asset).toMatchObject({
    kind: 'graphic',
    width: 40,
    height: 30,
    type: 'image/gif',
    quality: 'original',
    sources: [],
  })
  expect(files[0].bytes).toEqual(gif)
  expect(diagnostics.map((d: { code: string }) => d.code)).toEqual(['M004'])
})

it('media() validates options as P115 and provides media.build with the M namespace', () => {
  const p = media({ formats: ['avif', 'webp'], widths: [800, 400] })
  expect(p.provides).toEqual(['media.build', 'media.server'])
  const m = p.contribute({ command: 'check', mode: 'development', root: '' })
  expect(m.provides![0]!.sides.build!.options).toEqual({
    formats: ['avif', 'webp'],
    widths: [400, 800],
  })
  expect(m.diagnostics!.map((d: { code: string }) => d.code)).toEqual(
    Array.from({ length: 19 }, (_, i) => `M${String(i + 1).padStart(3, '0')}`),
  )
  expect(p.namespace).toBe('M')
  expect(() => media({ formats: ['jxl'] })).toThrow(
    expect.objectContaining({ code: 'P115', path: 'formats.0' }),
  )
  expect(() => media({ quality: { target: 120 } })).toThrow(
    expect.objectContaining({ code: 'P115', path: 'quality.target' }),
  )
  expect(() => media({ placeholder: 'url' as never })).toThrow(
    expect.objectContaining({ code: 'P115', path: 'placeholder' }),
  )
})
