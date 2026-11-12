// @kerf-js/core/media (research 26 §2): the header probe, <Media>'s markup, and @kerf-js/core/vite's `?media` and `kerf:fonts` loaders,
// with and without a build-side provider.
// kerf-allow T005: the markup is the contract here (srcset, sizes, dimensions), so the test reads attributes
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { render } from '@kerf-js/core/test'
import { Media, mediaSizes, timedSources, timeline, type MediaAsset } from '@kerf-js/core/media'
import { flush } from '@kerf-js/core'
import { probe } from '../media-probe.mjs'
import { assets, readSources } from '../assets.mjs'

const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(
    parts.flatMap((p) => (typeof p === 'string' ? Array.from(p, (c) => c.charCodeAt(0)) : p)),
  )

const PNG = bytes(
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  u32(13),
  'IHDR',
  u32(1200),
  u32(735),
  [8, 6, 0, 0, 0],
)
const GIF = bytes('GIF89a', [0x40, 0x01, 0xf0, 0x00])
const jpeg = (orientation?: number) => {
  const exif = orientation
    ? [
        0xff,
        0xe1,
        0,
        34,
        ...Array.from('Exif', (c) => c.charCodeAt(0)),
        0,
        0,
        ...Array.from('MM', (c) => c.charCodeAt(0)),
        0,
        42,
        ...u32(8),
        0,
        1,
        0x01,
        0x12,
        0,
        3,
        ...u32(1),
        0,
        orientation,
        0,
        0,
        ...u32(0),
      ]
    : []
  return bytes(
    [0xff, 0xd8],
    exif,
    [0xff, 0xc0, 0, 17, 8],
    [0x01, 0xe0, 0x02, 0x80],
    [3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1],
  )
}
const WEBP = bytes(
  'RIFF',
  [0, 0, 0, 0],
  'WEBP',
  'VP8X',
  [10, 0, 0, 0, 0, 0, 0, 0],
  [0x7f, 0x02, 0x00],
  [0xdf, 0x01, 0x00],
)
const AVIF = bytes(
  [0, 0, 0, 20],
  'ftypavif',
  [0, 0, 0, 0],
  'mif1',
  [0, 0, 0, 20],
  'ispe',
  [0, 0, 0, 0],
  u32(2048),
  u32(1536),
)

test('probe() reads dimensions from every still format kerf accepts', () => {
  expect(probe(PNG)).toEqual({ width: 1200, height: 735, type: 'image/png' })
  expect(probe(GIF)).toEqual({ width: 320, height: 240, type: 'image/gif' })
  expect(probe(jpeg())).toEqual({ width: 640, height: 480, type: 'image/jpeg' })
  expect(probe(jpeg(6))).toEqual({ width: 480, height: 640, type: 'image/jpeg' }) // EXIF: rotated 90°
  expect(probe(WEBP)).toEqual({ width: 640, height: 480, type: 'image/webp' })
  expect(probe(AVIF)).toEqual({ width: 2048, height: 1536, type: 'image/avif' })
  const svg = (s: string) => new TextEncoder().encode(s)
  expect(
    probe(svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 12"></svg>'), 'i.svg'),
  ).toEqual({ width: 24, height: 12, type: 'image/svg+xml' })
  expect(probe(svg('<svg width="48px" viewBox="0 0 24 12"></svg>'), 'i.svg')).toEqual({
    width: 48,
    height: 24,
    type: 'image/svg+xml',
  })
  expect(probe(svg('<svg width="100%"></svg>'), 'i.svg')).toBeUndefined()
  expect(probe(bytes('hello world'))).toBeUndefined()
})

test('mediaSizes(): explicit, from a width, auto for lazy, 100vw for eager', () => {
  expect(mediaSizes(undefined, '(min-width: 800px) 400px, 100vw', true)).toBe(
    '(min-width: 800px) 400px, 100vw',
  )
  expect(mediaSizes('1/3', undefined, true)).toBe('(max-width: 599px) 100vw, 33.33vw')
  expect(mediaSizes('50vw', undefined, true)).toBe('(max-width: 599px) 100vw, 50vw')
  expect(mediaSizes('240px', undefined, true)).toBe('240px')
  expect(mediaSizes(undefined, undefined, true)).toBe('auto, 100vw')
  expect(mediaSizes(undefined, undefined, false)).toBe('100vw')
})

const hero: MediaAsset = {
  kind: 'photo',
  src: '/a/hero-640.jpg',
  width: 640,
  height: 480,
  type: 'image/jpeg',
  name: 'hero.jpg',
  sources: [
    { type: 'image/avif', srcset: '/a/hero-320.avif 320w, /a/hero-640.avif 640w' },
    { type: 'image/jpeg', srcset: '/a/hero-320.jpg 320w, /a/hero-640.jpg 640w' },
  ],
  dominant: '#336699',
  placeholder: 'data:image/webp;base64,AAAA',
}

const clip: MediaAsset = {
  kind: 'video',
  src: '/a/c-640.mp4',
  width: 640,
  height: 360,
  type: 'video/mp4',
  name: 'c.mov',
  poster: '/a/c.webp',
  duration: 8,
  audio: true,
  sources: [
    {
      type: 'video/webm; codecs="av01.0.08M.08, opus"',
      srcset: '/a/c-320.webm 320w, /a/c-640.webm 640w',
    },
    {
      type: 'video/mp4; codecs="avc1.64001e, mp4a.40.2"',
      srcset: '/a/c-320.mp4 320w, /a/c-640.mp4 640w',
    },
  ],
}

test('timedSources(): efficient codec first, small widths behind a media query, the largest open', () => {
  expect(timedSources(clip).map((s) => [s.src, s.media])).toEqual([
    ['/a/c-320.webm', '(max-width: 160px)'],
    ['/a/c-640.webm', undefined],
    ['/a/c-320.mp4', '(max-width: 160px)'],
    ['/a/c-640.mp4', undefined],
  ])
})

test('<Media> video: poster, box, controls, no autoplay, nothing loaded until asked', () => {
  render(() => <Media src={clip} alt="Storage tour" />)
  const v = document.querySelector('video')!
  expect(v.getAttribute('poster')).toBe('/a/c.webp')
  expect(v.getAttribute('aria-label')).toBe('Storage tour')
  expect(v.getAttribute('width')).toBe('640')
  expect(v.getAttribute('preload')).toBe('none')
  expect(v.hasAttribute('controls')).toBe(true)
  expect(v.hasAttribute('autoplay')).toBe(false)
  expect(v.querySelectorAll('source').length).toBe(4)
})

test('<Media> GIF as video: muted autoplay loop as an image; a pause control past 5 s', () => {
  const gif = { ...clip, animated: true, audio: false, loop: 0, duration: 3 }
  const { unmount } = render(() => <Media src={gif} alt="Spinner" />)
  let v = document.querySelector('video')!
  expect(v.getAttribute('role')).toBe('img')
  expect(v.hasAttribute('autoplay') && v.hasAttribute('loop')).toBe(true)
  expect(v.muted).toBe(true)
  expect(v.hasAttribute('controls')).toBe(false)
  unmount()
  render(() => <Media src={{ ...gif, duration: 6 }} alt="Spinner" />)
  v = document.querySelector('video')!
  expect(v.hasAttribute('controls')).toBe(true)
})

test('<Media> audio: controls, sources, a label', () => {
  render(() => (
    <Media
      src={{
        ...clip,
        kind: 'audio',
        width: 0,
        height: 0,
        sources: [{ type: 'audio/webm; codecs="opus"', srcset: '/a/t.webm 1w' }],
      }}
      alt="Theme"
    />
  ))
  const a = document.querySelector('audio')!
  expect(a.getAttribute('aria-label')).toBe('Theme')
  expect(a.querySelector('source')!.getAttribute('src')).toBe('/a/t.webm')
})

/** An element with just what a timeline drives. */
class Fake extends EventTarget {
  paused = true
  ended = false
  loop = false
  duration = 8
  currentTime = 0
  plays = 0
  block = false
  // oxlint-disable-next-line require-await -- HTMLMediaElement.play rejects, it never throws
  async play() {
    if (this.block) throw new Error('NotAllowedError')
    this.paused = false
    this.plays++
    this.dispatchEvent(new Event('play'))
  }
  pause() {
    this.paused = true
    this.dispatchEvent(new Event('pause'))
  }
  frames: ((n: number, m: { mediaTime: number }) => void)[] = []
  requestVideoFrameCallback(run: (n: number, m: { mediaTime: number }) => void) {
    this.frames.push(run)
    return 1
  }
  present(mediaTime: number) {
    this.frames.splice(0).forEach((run) => run(0, { mediaTime }))
  }
}

test('timeline: writes are commands, frames write time, cues fire on crossing and not on a seek', async () => {
  const t = timeline(clip, { cues: { drop: 1.2, chorus: 3 } })
  const el = new Fake()
  t.bind(el as never)
  const fired: string[] = []
  t.on('drop', () => fired.push('drop'))
  t.on('chorus', () => fired.push('chorus'))

  t.playing.value = true
  flush()
  await Promise.resolve()
  expect(el.plays).toBe(1)
  el.present(1)
  expect(t.currentTime.value).toBe(1)
  expect(el.currentTime).toBe(0) // a frame is not a seek
  expect(t.cue.value).toBe(null)
  el.present(1.25)
  expect(fired).toEqual(['drop'])
  expect(t.cue.value).toBe('drop')

  el.currentTime = 5
  t.currentTime.value = 5
  flush()
  el.dispatchEvent(new Event('seeked'))
  expect(fired).toEqual(['drop']) // jumped over chorus
  expect(t.cue.value).toBe('chorus')

  t.currentTime.value = 2
  flush()
  expect(el.currentTime).toBe(2)
  t.playing.value = false
  flush()
  expect(el.paused).toBe(true)
})

test('timeline: a blocked play() leaves it paused, with the error in a box', async () => {
  const t = timeline(clip)
  const el = new Fake()
  el.block = true
  t.bind(el as never)
  t.playing.value = true
  flush()
  await Promise.resolve()
  await Promise.resolve()
  flush()
  expect(t.playing.value).toBe(false)
  expect(t.error.value?.message).toBe('NotAllowedError')
})

test('<Media>: a picture with AVIF first, the fallback img with dimensions, placeholder and lazy loading', () => {
  render(() => <Media src={hero} alt="Studio gallery at night" width="1/2" class="hero" />)
  const source = document.querySelector('picture > source')!
  expect(source.getAttribute('type')).toBe('image/avif')
  expect(source.getAttribute('srcset')).toBe('/a/hero-320.avif 320w, /a/hero-640.avif 640w')
  expect(source.getAttribute('sizes')).toBe('(max-width: 599px) 100vw, 50vw')
  const img = document.querySelector('picture > img')!
  expect(
    Object.fromEntries(
      ['src', 'srcset', 'width', 'height', 'alt', 'loading', 'decoding', 'class'].map((a) => [
        a,
        img.getAttribute(a),
      ]),
    ),
  ).toEqual({
    src: '/a/hero-640.jpg',
    srcset: '/a/hero-320.jpg 320w, /a/hero-640.jpg 640w',
    width: '640',
    height: '480',
    alt: 'Studio gallery at night',
    loading: 'lazy',
    decoding: 'async',
    class: 'hero',
  })
  expect(img.hasAttribute('fetchpriority')).toBe(false)
  expect(img.getAttribute('style')).toMatch(/aspect-ratio: ?640\/480/)
  expect(img.getAttribute('style')).toMatch(/url\("?data:image\/webp;base64,AAAA"?\)/)
})

test('<Media priority decorative focus>: eager, high priority, empty alt, object-position', () => {
  render(() => <Media src={hero} alt="" decorative priority focus={[0.3, 0.4]} />)
  const img = document.querySelector('img')!
  expect([
    img.getAttribute('loading'),
    img.getAttribute('fetchpriority'),
    img.getAttribute('alt'),
  ]).toEqual(['eager', 'high', ''])
  expect(img.getAttribute('sizes')).toBe('100vw')
  expect(img.getAttribute('style')).toMatch(/object-position: ?30% 40%/)
})

test('<Media> of a single-file asset (a vector, or no provider) is one img, without a placeholder', () => {
  const icon: MediaAsset = {
    kind: 'vector',
    src: '/a/logo.svg',
    width: 24,
    height: 12,
    type: 'image/svg+xml',
    name: 'logo.svg',
    sources: [],
  }
  render(() => <Media src={icon} alt="kerf" />)
  expect(document.querySelector('picture')).toBeNull()
  const img = document.querySelector('img')!
  expect([
    img.getAttribute('srcset'),
    img.getAttribute('sizes'),
    img.getAttribute('width'),
  ]).toEqual([null, null, '24'])
  expect(img.getAttribute('style')).not.toContain('background')
})

describe('@kerf-js/core/vite assets', () => {
  const fixture = setupAssetTests()
  registerMediaAssetTests(fixture)
  registerFontAssetTests(fixture)
})

type Emitted = { type: string; fileName: string; source: unknown }
type Hooks = {
  configResolved(config: object): void
  load: { handler(this: object, id: string): Promise<string> }
  configureServer(server: {
    middlewares: { use(fn: (req: { url: string }, res: unknown, next: () => void) => void): void }
  }): void
  transform: { filter: { id: RegExp }; handler(this: object, code: string): unknown }
  transformIndexHtml: { order: string; handler(): unknown }
}

function setupAssetTests() {
  let root: string
  const provider = join(import.meta.dirname, 'fixtures', 'media', 'provider.mjs')
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'kerf-assets-'))
    writeFileSync(join(root, 'package.json'), '{}')
    writeFileSync(join(root, 'hero.png'), PNG)
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))
  function plugin(command: 'build' | 'serve') {
    const p = assets() as unknown as Hooks
    p.configResolved({ root, command, base: '/' })
    const emitted: Emitted[] = []
    const warnings: string[] = []
    const ctx = {
      emitFile: (f: Emitted) => emitted.push(f),
      addWatchFile() {},
      warn: (m: string) => warnings.push(m),
      error: (m: string) => {
        throw new Error(m)
      },
    }
    const load = (id: string) => p.load.handler.call(ctx, id)
    return { p, load, emitted, warnings }
  }
  const bind = (id: string, ref: object) => {
    mkdirSync(join(root, '.kerf', 'slots'), { recursive: true })
    writeFileSync(
      join(root, '.kerf', 'slots', `${id}.build.json`),
      JSON.stringify({ plugin: '@test/p', version: '0.0.0', module: provider, ...ref }),
    )
  }
  const record = (code: string) => JSON.parse(code.replace(/^export default /, ''))
  return {
    get root() {
      return root
    },
    plugin,
    bind,
    record,
  }
}

function registerMediaAssetTests(fixture: ReturnType<typeof setupAssetTests>) {
  const { plugin, bind, record } = fixture

  test("readSources: the app's own text, without dependencies, build output or dot folders", () => {
    for (const dir of ['src/routes', 'node_modules/x', 'dist', '.kerf'])
      mkdirSync(join(fixture.root, dir), { recursive: true })
    writeFileSync(join(fixture.root, 'src/routes/a.tsx'), 'in-tsx')
    writeFileSync(join(fixture.root, 'src/a.css'), 'in-css')
    writeFileSync(join(fixture.root, 'src/a.png'), 'in-png')
    writeFileSync(join(fixture.root, 'node_modules/x/a.css'), 'in-dep')
    writeFileSync(join(fixture.root, 'dist/a.js'), 'in-dist')
    writeFileSync(join(fixture.root, '.kerf/a.ts'), 'in-kerf')
    const text = readSources(fixture.root)
    expect(text).toContain('in-tsx')
    expect(text).toContain('in-css')
    expect(text).not.toMatch(/in-(png|dep|dist|kerf)/)
  })

  test('`?media` with no provider: the original file, its header size, emitted under assets/', async () => {
    const { load, emitted } = plugin('build')
    const a = record(await load(join(fixture.root, 'hero.png') + '?media'))
    expect(a).toMatchObject({
      kind: 'graphic',
      width: 1200,
      height: 735,
      type: 'image/png',
      sources: [],
      name: 'hero.png',
      quality: 'original',
    })
    expect(a.src).toMatch(/^\/assets\/hero-[0-9a-f]{8}\.png$/)
    expect(emitted).toEqual([expect.objectContaining({ type: 'asset', fileName: a.src.slice(1) })])
  })

  test('`?media` with a media.build provider: its record, URLs mapped, files served in dev, diagnostics surfaced', async () => {
    bind('media.build', { export: 'createMediaBuild', options: { warn: true } })
    const { p, load, emitted, warnings } = plugin('serve')
    const a = record(await load(join(fixture.root, 'hero.png') + '?media'))
    expect(a.src).toBe('/@kerf-assets/hero-640.jpg')
    expect(a.sources[0].srcset).toBe(
      '/@kerf-assets/hero-320.avif 320w, /@kerf-assets/hero-640.avif 640w',
    )
    expect(emitted).toEqual([]) // dev serves from memory
    expect(warnings).toEqual(['M004 hero.png is large (dev)'])
    let served: Record<string, unknown> | undefined
    const res = {
      setHeader: (k: string, v: string) => ((served ??= {})[k] = v),
      end: (b: Buffer) => (served!.body = [...b]),
    }
    p.configureServer({
      middlewares: { use: (fn) => fn({ url: '/@kerf-assets/hero-320.avif' }, res, () => {}) },
    })
    expect(served).toEqual({
      'content-type': 'image/avif',
      'cache-control': 'no-cache',
      body: [PNG.length],
    })
  })

  test('`?media&photo` hands the provider the photo hint; plain `?media` none', async () => {
    bind('media.build', { export: 'createMediaBuild', options: {} })
    const { load } = plugin('build')
    const hinted = record(await load(join(fixture.root, 'hero.png') + '?media&photo'))
    expect(hinted.hinted).toEqual({ photo: true })
    const plain = record(await load(join(fixture.root, 'hero.png') + '?media'))
    expect(plain.hinted).toBeUndefined()
  })
}

function registerFontAssetTests(fixture: ReturnType<typeof setupAssetTests>) {
  const { plugin, bind } = fixture

  test('kerf:fonts: empty without font.build; with it, the CSS, the preloads, the files and .kerf/fonts.json', async () => {
    const { load } = plugin('build')
    expect(await load('\0kerf:fonts.css')).toBe('')
    expect(await load('\0kerf:fonts/preloads')).toBe('export const preloads = []\n')

    bind('font.build', { export: 'createFontBuild', options: { family: 'Inter' } })
    const built = plugin('build')
    expect(await built.load('\0kerf:fonts.css')).toBe(
      '@font-face{font-family:"Inter";src:url(/assets/f-latin.woff2) format("woff2")}',
    )
    expect(await built.load('\0kerf:fonts/preloads')).toBe(
      'export const preloads = [{"href":"/assets/f-latin.woff2","type":"font/woff2"}]\n',
    )
    expect(built.emitted.map((f) => f.fileName)).toEqual(['assets/f-latin.woff2']) // built once for both modules
    expect(JSON.parse(readFileSync(join(fixture.root, '.kerf', 'fonts.json'), 'utf8'))).toEqual({
      plugin: '@test/p',
      metrics: { Inter: { capHeight: 0.7 } },
      report: { preloadBytes: 3 },
    })
  })

  test('with a font build the client imports kerf:fonts itself: a Start entry, or an HTML page', () => {
    const entry = (p: Hooks, id: string, consumer = 'client') =>
      p.transform.filter.id.test(id)
        ? p.transform.handler.call({ environment: { config: { consumer } } }, 'start()\n')
        : undefined
    const before = plugin('build').p
    expect(entry(before, '\0virtual:kerf/entry-client')).toBeUndefined()
    expect(before.transformIndexHtml.handler()).toBeUndefined()

    bind('font.build', { export: 'createFontBuild', options: { family: 'Inter' } })
    const { p } = plugin('build')
    for (const id of ['\0virtual:kerf/entry-client', join(fixture.root, 'src/entry.client.ts')])
      expect(entry(p, id)).toEqual({ code: "import 'kerf:fonts'\nstart()\n", map: null })
    expect(entry(p, join(fixture.root, 'src/entry.client.ts'), 'server')).toBeUndefined()
    expect(entry(p, join(fixture.root, 'src/app.ts'))).toBeUndefined()
    expect(entry(p, '\0virtual:kerf/entry-client?assets=client')).toBeUndefined()
    expect(p.transformIndexHtml.order).toBe('pre')
    expect(p.transformIndexHtml.handler()).toEqual([
      {
        tag: 'script',
        attrs: { type: 'module' },
        children: "import 'kerf:fonts'",
        injectTo: 'head',
      },
    ])
  })

  test('every environment emits the font files, whichever asked first', async () => {
    bind('font.build', { export: 'createFontBuild', options: { family: 'Inter' } })
    const { p } = plugin('build')
    const emit = (out: string[], name: string) => ({
      environment: { name },
      emitFile: (f: Emitted) => out.push(f.fileName),
    })
    const ssr: string[] = [],
      client: string[] = []
    await p.load.handler.call(emit(ssr, 'ssr'), '\0kerf:fonts/preloads')
    await p.load.handler.call(emit(client, 'client'), '\0kerf:fonts.css')
    await p.load.handler.call(emit(client, 'client'), '\0kerf:fonts/preloads')
    expect(ssr).toEqual(['assets/f-latin.woff2'])
    expect(client).toEqual(['assets/f-latin.woff2'])
  })
}
