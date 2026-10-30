// weft/media (research 26 §2): the header probe, <Media>'s markup, and weft/vite's `?media` and `weft:fonts` loaders,
// with and without a build-side provider.
// weft-allow T005: the markup is the contract here (srcset, sizes, dimensions), so the test reads attributes
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { render } from 'weft/test'
import { Media, mediaSizes, type MediaAsset } from 'weft/media'
import { probe } from '../media-probe.mjs'
import { assets } from '../assets.mjs'

const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const bytes = (...parts: (number[] | string)[]) => new Uint8Array(parts.flatMap(p => (typeof p === 'string' ? [...p].map(c => c.charCodeAt(0)) : p)))

const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], u32(13), 'IHDR', u32(1200), u32(735), [8, 6, 0, 0, 0])
const GIF = bytes('GIF89a', [0x40, 0x01, 0xf0, 0x00])
const jpeg = (orientation?: number) => {
  const exif = orientation
    ? [0xff, 0xe1, 0, 34, ...[...'Exif'].map(c => c.charCodeAt(0)), 0, 0, ...[...'MM'].map(c => c.charCodeAt(0)), 0, 42, ...u32(8), 0, 1, 0x01, 0x12, 0, 3, ...u32(1), 0, orientation, 0, 0, ...u32(0)]
    : []
  return bytes([0xff, 0xd8], exif, [0xff, 0xc0, 0, 17, 8], [0x01, 0xe0, 0x02, 0x80], [3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1])
}
const WEBP = bytes('RIFF', [0, 0, 0, 0], 'WEBP', 'VP8X', [10, 0, 0, 0, 0, 0, 0, 0], [0x7f, 0x02, 0x00], [0xdf, 0x01, 0x00])
const AVIF = bytes([0, 0, 0, 20], 'ftypavif', [0, 0, 0, 0], 'mif1', [0, 0, 0, 20], 'ispe', [0, 0, 0, 0], u32(2048), u32(1536))

test('probe() reads dimensions from every still format weft accepts', () => {
  expect(probe(PNG)).toEqual({ width: 1200, height: 735, type: 'image/png' })
  expect(probe(GIF)).toEqual({ width: 320, height: 240, type: 'image/gif' })
  expect(probe(jpeg())).toEqual({ width: 640, height: 480, type: 'image/jpeg' })
  expect(probe(jpeg(6))).toEqual({ width: 480, height: 640, type: 'image/jpeg' }) // EXIF: rotated 90°
  expect(probe(WEBP)).toEqual({ width: 640, height: 480, type: 'image/webp' })
  expect(probe(AVIF)).toEqual({ width: 2048, height: 1536, type: 'image/avif' })
  const svg = (s: string) => new TextEncoder().encode(s)
  expect(probe(svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 12"></svg>'), 'i.svg')).toEqual({ width: 24, height: 12, type: 'image/svg+xml' })
  expect(probe(svg('<svg width="48px" viewBox="0 0 24 12"></svg>'), 'i.svg')).toEqual({ width: 48, height: 24, type: 'image/svg+xml' })
  expect(probe(svg('<svg width="100%"></svg>'), 'i.svg')).toBeUndefined()
  expect(probe(bytes('hello world'))).toBeUndefined()
})

test('mediaSizes(): explicit, from a width, auto for lazy, 100vw for eager', () => {
  expect(mediaSizes(undefined, '(min-width: 800px) 400px, 100vw', true)).toBe('(min-width: 800px) 400px, 100vw')
  expect(mediaSizes('1/3', undefined, true)).toBe('(max-width: 599px) 100vw, 33.33vw')
  expect(mediaSizes('50vw', undefined, true)).toBe('(max-width: 599px) 100vw, 50vw')
  expect(mediaSizes('240px', undefined, true)).toBe('240px')
  expect(mediaSizes(undefined, undefined, true)).toBe('auto, 100vw')
  expect(mediaSizes(undefined, undefined, false)).toBe('100vw')
})

const hero: MediaAsset = {
  kind: 'photo', src: '/a/hero-640.jpg', width: 640, height: 480, type: 'image/jpeg', name: 'hero.jpg',
  sources: [{ type: 'image/avif', srcset: '/a/hero-320.avif 320w, /a/hero-640.avif 640w' }, { type: 'image/jpeg', srcset: '/a/hero-320.jpg 320w, /a/hero-640.jpg 640w' }],
  dominant: '#336699', placeholder: 'data:image/webp;base64,AAAA',
}

test('<Media>: a picture with AVIF first, the fallback img with dimensions, placeholder and lazy loading', () => {
  render(() => <Media src={hero} alt="Studio gallery at night" width="1/2" class="hero" />)
  const source = document.querySelector('picture > source')!
  expect(source.getAttribute('type')).toBe('image/avif')
  expect(source.getAttribute('srcset')).toBe('/a/hero-320.avif 320w, /a/hero-640.avif 640w')
  expect(source.getAttribute('sizes')).toBe('(max-width: 599px) 100vw, 50vw')
  const img = document.querySelector('picture > img')!
  expect(Object.fromEntries(['src', 'srcset', 'width', 'height', 'alt', 'loading', 'decoding', 'class'].map(a => [a, img.getAttribute(a)]))).toEqual({
    src: '/a/hero-640.jpg', srcset: '/a/hero-320.jpg 320w, /a/hero-640.jpg 640w', width: '640', height: '480',
    alt: 'Studio gallery at night', loading: 'lazy', decoding: 'async', class: 'hero',
  })
  expect(img.hasAttribute('fetchpriority')).toBe(false)
  expect(img.getAttribute('style')).toMatch(/aspect-ratio: ?640\/480/)
  expect(img.getAttribute('style')).toMatch(/url\("?data:image\/webp;base64,AAAA"?\)/)
})

test('<Media priority decorative focus>: eager, high priority, empty alt, object-position', () => {
  render(() => <Media src={hero} alt="" decorative priority focus={[0.3, 0.4]} />)
  const img = document.querySelector('img')!
  expect([img.getAttribute('loading'), img.getAttribute('fetchpriority'), img.getAttribute('alt')]).toEqual(['eager', 'high', ''])
  expect(img.getAttribute('sizes')).toBe('100vw')
  expect(img.getAttribute('style')).toMatch(/object-position: ?30% 40%/)
})

test('<Media> of a single-file asset (a vector, or no provider) is one img, without a placeholder', () => {
  const icon: MediaAsset = { kind: 'vector', src: '/a/logo.svg', width: 24, height: 12, type: 'image/svg+xml', name: 'logo.svg', sources: [] }
  render(() => <Media src={icon} alt="weft" />)
  expect(document.querySelector('picture')).toBeNull()
  const img = document.querySelector('img')!
  expect([img.getAttribute('srcset'), img.getAttribute('sizes'), img.getAttribute('width')]).toEqual([null, null, '24'])
  expect(img.getAttribute('style')).not.toContain('background')
})

describe('weft/vite assets', () => {
  let root: string
  const provider = join(import.meta.dirname, 'fixtures', 'media', 'provider.mjs')
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'weft-assets-'))
    writeFileSync(join(root, 'package.json'), '{}')
    writeFileSync(join(root, 'hero.png'), PNG)
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  function plugin(command: 'build' | 'serve') {
    const p: any = assets()
    p.configResolved({ root, command, base: '/' })
    const emitted: any[] = []
    const warnings: string[] = []
    const ctx = { emitFile: (f: any) => emitted.push(f), addWatchFile() {}, warn: (m: string) => warnings.push(m), error: (m: string) => { throw new Error(m) } }
    const load = (id: string) => p.load.handler.call(ctx, id)
    return { p, load, emitted, warnings }
  }
  const bind = (id: string, ref: object) => {
    mkdirSync(join(root, '.weft', 'slots'), { recursive: true })
    writeFileSync(join(root, '.weft', 'slots', `${id}.build.json`), JSON.stringify({ plugin: '@test/p', version: '0.0.0', module: provider, ...ref }))
  }
  const record = (code: string) => JSON.parse(code.replace(/^export default /, ''))

  test('`?media` with no provider: the original file, its header size, emitted under assets/', async () => {
    const { load, emitted } = plugin('build')
    const a = record(await load(join(root, 'hero.png') + '?media'))
    expect(a).toMatchObject({ kind: 'graphic', width: 1200, height: 735, type: 'image/png', sources: [], name: 'hero.png', quality: 'original' })
    expect(a.src).toMatch(/^\/assets\/hero-[0-9a-f]{8}\.png$/)
    expect(emitted).toEqual([expect.objectContaining({ type: 'asset', fileName: a.src.slice(1) })])
  })

  test('`?media` with a media.build provider: its record, URLs mapped, files served in dev, diagnostics surfaced', async () => {
    bind('media.build', { export: 'createMediaBuild', options: { warn: true } })
    const { p, load, emitted, warnings } = plugin('serve')
    const a = record(await load(join(root, 'hero.png') + '?media'))
    expect(a.src).toBe('/@weft-assets/hero-640.jpg')
    expect(a.sources[0].srcset).toBe('/@weft-assets/hero-320.avif 320w, /@weft-assets/hero-640.avif 640w')
    expect(emitted).toEqual([]) // dev serves from memory
    expect(warnings).toEqual(['M004 hero.png is large (dev)'])
    let served: any
    const res = { setHeader: (k: string, v: string) => ((served ??= {})[k] = v), end: (b: Buffer) => (served.body = [...b]) }
    p.configureServer({ middlewares: { use: (fn: any) => fn({ url: '/@weft-assets/hero-320.avif' }, res, () => {}) } })
    expect(served).toEqual({ 'content-type': 'image/avif', 'cache-control': 'no-cache', body: [PNG.length] })
  })

  test('weft:fonts: empty without font.build; with it, the CSS, the preloads, the files and .weft/fonts.json', async () => {
    let { load } = plugin('build')
    expect(await load('\0weft:fonts.css')).toBe('')
    expect(await load('\0weft:fonts/preloads')).toBe('export const preloads = []\n')

    bind('font.build', { export: 'createFontBuild', options: { family: 'Inter' } })
    const built = plugin('build')
    expect(await built.load('\0weft:fonts.css')).toBe('@font-face{font-family:"Inter";src:url(/assets/f-latin.woff2) format("woff2")}')
    expect(await built.load('\0weft:fonts/preloads')).toBe('export const preloads = [{"href":"/assets/f-latin.woff2","type":"font/woff2"}]\n')
    expect(built.emitted.map(f => f.fileName)).toEqual(['assets/f-latin.woff2']) // built once for both modules
    expect(JSON.parse(readFileSync(join(root, '.weft', 'fonts.json'), 'utf8'))).toEqual({ plugin: '@test/p', metrics: { Inter: { capHeight: 0.7 } }, report: { preloadBytes: 3 } })
  })
})
