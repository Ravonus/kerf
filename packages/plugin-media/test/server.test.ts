// media.server@1 on real encodes (research 29 §6): negotiation, the record `ingest` returns, what it refuses, the ladder
// `serve` keeps to, one encode per variant, EXIF orientation, and `encoder: 'server'` for `?media` imports.
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMediaBuild } from '../src/build.mjs'
import { media } from '../src/index.mjs'
import { createMediaServer, negotiate } from '../src/server.mjs'

const png = (width = 200, height = 100) =>
  sharp({ create: { width, height, channels: 3, background: '#c83c14' } })
    .png()
    .toBuffer()
const options = { formats: ['avif', 'webp'], widths: [64, 128] }
let dir: string
let m: ReturnType<ReturnType<typeof createMediaServer>['at']>
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'weft-media-server-'))
  m = createMediaServer({ ...options, server: { dir } }).at('/unused')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))
const hashOf = (asset: { src: string }) => /\/_weft\/m\/([0-9a-f]{32})\//.exec(asset.src)![1]!

describe('negotiate', () => {
  const formats = ['avif', 'webp']
  it.each([
    ['image/avif,image/webp,*/*;q=0.8', 'avif'],
    ['image/webp,*/*', 'webp'],
    ['image/avif;q=0,image/webp', 'webp'],
    ['image/*,*/*;q=0.8', 'png'], // a wildcard promises nothing
    ['', 'png'],
  ])('%s → %s', (accept, want) => expect(negotiate(accept, formats, 'png')).toBe(want))
  it("follows the config's order, not the header's", () =>
    expect(negotiate('image/webp,image/avif', formats, 'png')).toBe('avif'))
})

describe('ingest', () => {
  it('returns a record of negotiated URLs capped by the source width', async () => {
    const a = await m.ingest(new Uint8Array(await png(100, 50)), { name: 'a.png' })
    expect(a).toMatchObject({
      kind: 'graphic',
      width: 100,
      height: 50,
      type: 'image/png',
      name: 'a.png',
      quality: 'fixed',
    })
    expect(a.src).toMatch(/\/100\.auto$/)
    expect(a.sources[0].srcset).toMatch(/\/64\.auto 64w, .*\/100\.auto 100w$/)
  })

  it('is content addressed: the same bytes under another name share a hash and keep their own name', async () => {
    const bytes = new Uint8Array(await png())
    const a = await m.ingest(bytes, { name: 'a.png' })
    const b = await m.ingest(bytes, { name: 'b.png' })
    expect(hashOf(a)).toBe(hashOf(b))
    expect(b.name).toBe('b.png')
    expect(readdirSync(dir)).toHaveLength(1)
  })

  it('swaps the dimensions for an EXIF rotation', async () => {
    const bytes = await sharp(await png(200, 100))
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer()
    expect(await m.ingest(new Uint8Array(bytes), { name: 'r.jpg' })).toMatchObject({
      width: 100,
      height: 200,
    })
  })

  it('M018: not an image, or over the limit', async () => {
    await expect(
      m.ingest(new TextEncoder().encode('not an image'), { name: 'x.png' }),
    ).rejects.toMatchObject({ code: 'M018' })
    const small = createMediaServer({ ...options, server: { dir, maxBytes: 10 } }).at('/unused')
    await expect(small.ingest(new Uint8Array(100), { name: 'x.png' })).rejects.toMatchObject({
      code: 'M018',
    })
  })

  it('M012: an SVG with a script is not stored', async () => {
    const evil = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>',
    )
    await expect(m.ingest(evil, { name: 'x.svg' })).rejects.toMatchObject({ code: 'M012' })
    expect(readdirSync(dir)).toHaveLength(0)
  })

  it('a clean SVG is served as it is, on `auto` only', async () => {
    const a = await m.ingest(
      new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
      ),
      { name: 'x.svg' },
    )
    expect(a).toMatchObject({ kind: 'vector', type: 'image/svg+xml', quality: 'original' })
    const hash = hashOf(a)
    expect(await m.serve({ hash, width: 10, format: 'auto', accept: '' })).toMatchObject({
      type: 'image/svg+xml',
      negotiated: false,
    })
    expect(await m.serve({ hash, width: 10, format: 'webp', accept: '' })).toBeNull()
  })
})

describe('serve', () => {
  it('negotiates `auto`, at the width asked for', async () => {
    const hash = hashOf(await m.ingest(new Uint8Array(await png()), { name: 'a.png' }))
    const r = await m.serve({ hash, width: 64, format: 'auto', accept: 'image/webp' })
    expect(r).toMatchObject({ type: 'image/webp', format: 'webp', negotiated: true })
    expect((await sharp(r.bytes).metadata()).width).toBe(64)
    expect((await m.serve({ hash, width: 64, format: 'auto', accept: '' })).type).toBe('image/png')
  })

  it('only widths on the ladder, formats configured, and well-formed hashes', async () => {
    const hash = hashOf(await m.ingest(new Uint8Array(await png()), { name: 'a.png' }))
    expect(await m.serve({ hash, width: 65, format: 'auto', accept: '' })).toBeNull()
    expect(await m.serve({ hash, width: 64, format: 'jpg', accept: '' })).toBeNull()
    expect(await m.serve({ hash: '../../etc', width: 64, format: 'auto', accept: '' })).toBeNull()
    expect(
      await m.serve({ hash: '0'.repeat(32), width: 64, format: 'auto', accept: '' }),
    ).toBeNull()
  })

  it('concurrent requests share one encode, and it lands whole', async () => {
    const hash = hashOf(await m.ingest(new Uint8Array(await png()), { name: 'a.png' }))
    const all = await Promise.all(
      Array.from({ length: 5 }, () => m.serve({ hash, width: 128, format: 'webp', accept: '' })),
    )
    expect(new Set(all.map((r) => Buffer.from(r.bytes).toString('base64'))).size).toBe(1)
    expect(readdirSync(join(dir, hash)).filter((f) => f.endsWith('.tmp'))).toEqual([])
  })
})

describe("encoder: 'server'", () => {
  it('`?media` imports become records, with no variants in the build', async () => {
    const context = { cacheDir: dir, root: dir }
    const out = await createMediaBuild({ ...options, encoder: 'server', server: { dir } }).build(
      { file: '/x/hero.png', bytes: new Uint8Array(await png()) },
      context,
    )
    expect(out.files).toEqual([])
    expect(out.asset.src).toMatch(/^\/_weft\/m\/[0-9a-f]{32}\/128\.auto$/)
    expect(
      await m.serve({ hash: hashOf(out.asset), width: 64, format: 'auto', accept: 'image/avif' }),
    ).toMatchObject({ type: 'image/avif' })
  })

  it("takes 'background', and `swap` only with it", () => {
    expect(media({ encoder: 'compatible', swap: 'idle' }).options).toEqual({
      encoder: 'compatible',
      swap: 'idle',
    })
    expect(() => media({ swap: 'idle' })).toThrow(/swap/)
    expect(() => media({ encoder: 'always' })).toThrow(/encoder/)
  })
})
