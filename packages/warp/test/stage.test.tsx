// The scene stage on a page: sections in order, posters under one pinned canvas, the active scene and its
// neighbours built, far scenes freed, the cut at 0.5 and the governor's pixel ratio. Positions come from mocked
// section boxes; the scenes are stand-ins that log what the stage asks of them.
import { renderToString } from '@weft-js/core/ssr'
import { clock } from '@weft-js/core/surface'
import { clock as time, flush, render } from '@weft-js/core/test'
import {
  bakedPosters,
  Scene,
  STAGE,
  Stage,
  type ActiveScene,
  type BlendOptions,
  type StageGovernor,
  type ScenePoster,
  type StageHandle,
  type StagePost,
  type StageScene,
  type StageSceneDef,
} from '@weft-js/warp/scenes'
import { FULL } from '@weft-js/warp-core/scenes'
import { dissolve, heldAt } from '../src/Stage-look'

const log: string[] = []
/** Each built stand-in's name, and the section pass its tracks give. */
const named = new WeakMap<StageScene, string>()
const tracked: Record<string, StagePost | null> = {}
const scene = (name: string): StageSceneDef => ({
  build({ seed }) {
    log.push(`build ${name} ${seed}`)
    const live: StageScene = {
      get post() {
        return tracked[name] ?? null
      },
      at: (position) => log.push(`at ${name} ${position.toFixed(2)}`),
      setQuality: (levers) => log.push(`quality ${name} ${levers.density}`),
      render: () => log.push(`render ${name}`),
      dispose: () => log.push(`dispose ${name}`),
    }
    named.set(live, name)
    return Promise.resolve(live)
  },
})
const NAMES = ['a', 'b', 'c', 'd']
const SCENES = NAMES.map(scene)
/** Full levers at 60 fps and the device's ratio up to 2: what a stage does with no governor. */
const UNGOVERNED: StageGovernor = {
  start: async () => {},
  frame: () => {},
  levers: FULL,
  fps: 60,
  pixelRatio: () => Math.min(devicePixelRatio, 2),
}

let tops: number[] = []
/** Puts each section's top at `tops[i]` viewports below the viewport's top; every section is one viewport tall. */
function place(next: number[]) {
  tops = next
  dispatchEvent(new Event('scroll'))
}
function box(this: HTMLElement) {
  if (this.hasAttribute('data-surface')) return { width: 100, height: 60, top: 0 } as DOMRect
  const index = [...document.querySelectorAll('section')].indexOf(this)
  return { top: (tops[index] ?? 9) * innerHeight, height: innerHeight, width: 100 } as DOMRect
}

async function frames(n = 12) {
  for (let i = 0; i < n; i++) await time.advance(17)
  await flush()
}

function page(governor = UNGOVERNED, onReady: (active: ActiveScene) => void = () => {}) {
  return render(() => (
    <Stage label="Four scenes" kind="canvas2d" governor={governor} onReady={onReady}>
      {NAMES.map((name, i) => (
        <Scene key={name} use={SCENES[i]!} poster={i ? `/${name}.jpg` : '#123456'} early={0}>
          <h2>{name}</h2>
        </Scene>
      ))}
    </Stage>
  ))
}

beforeEach(() => {
  log.length = 0
  for (const name of NAMES) tracked[name] = null
  tops = [0, 1, 2, 3]
  time.install()
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(box)
})
afterEach(() => vi.restoreAllMocks())

test('the sections scroll over one pinned canvas, each over its own pinned poster', async () => {
  const { container } = page()
  await flush()
  const viewport = container.querySelector<HTMLElement>('[data-stage-viewport]')!
  expect(viewport.style.position).toBe('sticky')
  expect(container.querySelectorAll('canvas')).toHaveLength(1)
  expect(viewport.querySelector('[data-surface]')!.getAttribute('style')).toContain('opacity: 0')
  const sections = [...container.querySelectorAll<HTMLElement>('section')]
  expect(sections.map((s) => s.dataset.scene)).toEqual(['0', '1', '2', '3'])
  const posters = sections.map((s) => s.querySelector<HTMLElement>('[data-scene-poster]')!)
  expect(posters.map((p) => p.style.position)).toEqual(['sticky', 'sticky', 'sticky', 'sticky'])
  expect(posters[0]!.style.background).toContain('rgb(18, 52, 86)')
  expect(posters[1]!.style.background).toContain('/b.jpg')
})

test('builds the active scene and its neighbours only, and frees a scene two away', async () => {
  page()
  await frames()
  expect(log.filter((l) => l.startsWith('build'))).toEqual(['build a 0', 'build b 1'])
  expect(log).toContain('render a')
  log.length = 0
  place([-3, -2, -1, 0])
  await frames()
  expect(log).toContain('dispose a')
  expect(log).toContain('build d 3')
  expect(log).toContain('render d')
  expect(document.querySelector('[data-active]')?.getAttribute('data-scene')).toBe('3')
})

test('during a hand-over without a blend it draws the outgoing scene until t = 0.5, then the incoming', async () => {
  page()
  await flush()
  place([-0.6, 0.6, 1.6, 2.6])
  await frames()
  log.length = 0
  place([-0.6, 0.6, 1.6, 2.6])
  await frames()
  expect(log.filter((l) => l.startsWith('render'))).not.toContain('render b')
  log.length = 0
  place([-0.4, 0.4, 1.4, 2.4])
  await frames()
  expect(log.filter((l) => l.startsWith('render')).at(-1)).toBe('render b')
})

test('a governor sets the pixel ratio and the levers every scene gets', async () => {
  const levers = { ...FULL, density: 0.5 }
  const governor: StageGovernor = {
    start: async () => {},
    frame: () => {},
    levers,
    fps: 60,
    pixelRatio: () => 1.5,
  }
  vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(3)
  page(governor)
  await frames()
  expect(log).toContain('quality a 0.5')
  expect(document.querySelector('canvas')!.width).toBe(150)
})

test('the server sends the sections, their posters and a sized place for the canvas, but no canvas', async () => {
  // @ts-expect-error: query imports (@weft-js/core/vite)
  const { StagePage } = await import('./fixtures/StagePage.tsx?weft-ssr')
  const html = renderToString(() => StagePage())
  expect(html).toContain('data-stage-viewport')
  expect(html).toContain('data-surface="stage"')
  expect(html).not.toContain('<canvas')
  expect(html.match(/data-scene-poster/g)).toHaveLength(3)
  expect(html).toContain('url(&quot;/second.avif&quot;)')
  expect(html).toMatch(/<img[^>]*src="\/third.avif"/)
  expect(html).toMatch(/<h2[^>]*>Second<\/h2>/)
})

test('a lost context frees every scene, and a restored one builds them again', async () => {
  const { container } = page()
  await frames()
  const canvas = container.querySelector('canvas')!
  log.length = 0
  canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
  expect(log.filter((l) => l.startsWith('dispose')).sort()).toEqual(['dispose a', 'dispose b'])
  log.length = 0
  canvas.dispatchEvent(new Event('webglcontextrestored'))
  await frames()
  expect(log.filter((l) => l.startsWith('build'))).toEqual(['build a 0', 'build b 1'])
  // The shared clock may be parked by an earlier test's fake timers: a seek paints every surface now.
  clock.seek(clock.seconds)
  expect(log).toContain('render a')
})

/** A blend that records each frame it is asked to draw. */
function recorder() {
  const drawn: { a: string; b: string; t: number; options: BlendOptions }[] = []
  return {
    drawn,
    blend: () => ({
      draw: (a: StageScene, b: StageScene, t: number, options: BlendOptions) =>
        drawn.push({ a: named.get(a)!, b: named.get(b)!, t, options }),
    }),
  }
}

function blended(blend: ReturnType<typeof recorder>['blend'], governor = UNGOVERNED) {
  return render(() => (
    <Stage label="Blended" kind="canvas2d" governor={governor} blend={blend}>
      <Scene use={SCENES[0]!} early={0} post={(position) => ({ progress: position, tear: 1 })}>
        <h2>a</h2>
      </Scene>
      <Scene use={SCENES[1]!} early={0} mode="radial" centre={{ x: 0.5, y: -0.25 }} lines={false}>
        <h2>b</h2>
      </Scene>
      <Scene use={SCENES[2]!} early={0}>
        <h2>c</h2>
      </Scene>
    </Stage>
  ))
}

test('a blend draws every frame: one scene alone at t = 1, a hand-over as the incoming scene asks', async () => {
  const { drawn, blend } = recorder()
  blended(blend, { ...UNGOVERNED, levers: { ...FULL, blendScale: 0.5 } })
  await frames()
  expect(drawn.at(-1)).toMatchObject({ a: 'a', b: 'a', t: 1 })
  expect(log.filter((l) => l.startsWith('render'))).toEqual([])
  place([-0.6, 0.6, 1.6])
  await frames()
  const { a, b, t, options } = drawn.at(-1)!
  expect([a, b]).toEqual(['a', 'b'])
  expect(t).toBeGreaterThan(0)
  expect(t).toBeLessThan(1)
  expect(options).toMatchObject({ mode: 'radial', centre: { x: 0.5, y: -0.25 }, lines: false })
  expect(options.levers.blendScale).toBe(0.5)
})

test("the active section's pass comes from its `post`, under what its scene's tracks give", async () => {
  const { drawn, blend } = recorder()
  blended(blend)
  place([-0.3, 0.7, 1.7])
  await frames()
  const post = drawn.at(-1)!.options.post!
  expect(post.tear).toBe(1)
  expect(post.progress).toBeCloseTo(1.3, 1)
  tracked.a = { tear: 0, darken: 0.4 }
  place([-0.31, 0.69, 1.69])
  await frames()
  expect(drawn.at(-1)!.options.post).toMatchObject({ tear: 0, darken: 0.4 })
  place([-3, -2, -0.5])
  await frames()
  expect(drawn.at(-1)).toMatchObject({ a: 'c', b: 'c', options: { post: null } })
})

test('under reduced motion the stage ignores the scroll hand-over and dissolves into a new scene over 300 ms', async () => {
  const reduce = (query: string) => ({ matches: query.includes('reduce') }) as MediaQueryList
  vi.spyOn(window, 'matchMedia').mockImplementation(reduce)
  const { drawn, blend } = recorder()
  blended(blend)
  await frames()
  place([-0.1, 0.9, 1.9])
  await frames()
  expect(drawn.at(-1)).toMatchObject({ a: 'a', b: 'a', t: 1 })
  place([-0.7, 0.3, 1.3])
  await frames(30)
  const fade = drawn.filter((d) => d.a === 'a' && d.b === 'b')
  // About 300 ms of frames 17 ms apart, each a plain dissolve further on than the last.
  expect(fade.length).toBeGreaterThan(12)
  expect(fade.length).toBeLessThan(20)
  expect(fade.every((d) => d.options.mode === 'fade' && !d.options.lines)).toBe(true)
  expect(fade.every((d, i) => d.t < 1 && (i === 0 || d.t > fade[i - 1]!.t))).toBe(true)
  expect(drawn.at(-1)).toMatchObject({ a: 'b', b: 'b', t: 1 })
})

test('a dissolve starts when the active scene changes, and is skipped when the scene before is gone', () => {
  const h = { active: 1, from: 0, to: 1, t: 0.6 }
  const first = dissolve(null, { ...h, active: 0, to: 0, t: 1 }, 0, () => true)
  expect(first).toMatchObject({ moving: false, shown: { from: 0, to: 0, t: 1 } })
  const half = dissolve(first.fade, h, 150, () => true)
  expect(half).toMatchObject({ moving: true, shown: { from: 0, to: 1, t: 0 } })
  expect(dissolve(half.fade, h, 300, () => true).shown).toMatchObject({ from: 0, to: 1, t: 0.5 })
  expect(dissolve(half.fade, h, 450, () => true)).toMatchObject({
    moving: false,
    shown: { from: 1, to: 1 },
  })
  expect(dissolve(first.fade, h, 150, (i) => i !== 0)).toMatchObject({
    moving: false,
    shown: { from: 1 },
  })
})

test('each section carries its scene position as `--scene-position`, for its own styles', async () => {
  const { container } = page()
  await frames()
  place([-0.25, 0.75, 1.75, 2.75])
  await frames(40)
  const read = (i: number) =>
    Number(container.querySelectorAll('section')[i]!.style.getPropertyValue('--scene-position'))
  expect(read(0)).toBeCloseTo(1.25, 2)
  expect(read(1)).toBeCloseTo(0.25, 2)
})

test('a scene with a `hold` stands there under reduced motion or a holding governor, and follows the scroll otherwise', async () => {
  const posed = async (governor: StageGovernor) => {
    log.length = 0
    const { unmount } = render(() => (
      <Stage label="Held" kind="canvas2d" governor={governor}>
        <Scene use={SCENES[0]!} early={0} hold={0.4}>
          <h2>a</h2>
        </Scene>
      </Stage>
    ))
    place([-0.5])
    await frames(30)
    unmount()
    return log.filter((l) => l.startsWith('at a')).at(-1)
  }
  expect(await posed(UNGOVERNED)).toBe('at a 1.50')
  expect(await posed({ ...UNGOVERNED, hold: true })).toBe('at a 0.40')
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) => ({ matches: query.includes('reduce') }) as MediaQueryList,
  )
  expect(await posed(UNGOVERNED)).toBe('at a 0.40')
})

test("a `<Scene hold>` wins over its scene's own, which stands in without one", () => {
  const live = { hold: 2 } as StageScene
  expect(heldAt({}, live, 1, true)).toBe(2)
  expect(heldAt({ hold: 0.5 }, live, 1, true)).toBe(0.5)
  expect(heldAt({ hold: 0.5 }, live, 1, false)).toBe(1)
})

test('once the positions catch up with the scroll and the wanted scenes have drawn, the stage says so', async () => {
  const ready: number[] = []
  const { container } = page(UNGOVERNED, (active) => ready.push(active.active))
  const root = container.querySelector<HTMLElement>('[data-stage]')!
  await frames()
  expect(root.dataset.stageReady).toBe('0')
  expect(ready).toEqual([0])
  place([-1.2, -0.2, 0.8, 1.8])
  await frames(3)
  expect(root.dataset.stageReady).toBeUndefined()
  await frames(40)
  expect(root.dataset.stageReady).toBe('0')
  expect(ready).toEqual([0, 1])
})

test('a still draws one scene alone at a position with the clock stopped, and hands back its pixels', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AA==')
  const { container } = page()
  await frames()
  const handle = (
    container.querySelector('[data-stage]') as unknown as Record<symbol, StageHandle>
  )[STAGE]!
  expect(handle.scenes().map((s) => [s.index, s.bake, s.rest.toFixed(2)])).toEqual([
    [0, false, '1.00'],
    [1, false, '1.00'],
    [2, false, '1.00'],
    [3, false, '1.00'],
  ])
  log.length = 0
  const png = handle.still(3, 0.75, 2)
  await frames()
  await expect(png).resolves.toBe('data:image/png;base64,AA==')
  expect(log).toContain('build d 3')
  expect(log).toContain('at d 0.75')
  expect(log.at(-1)).toBe('render d')
  expect(clock.playing.value).toBe(false)
  expect(clock.seconds).toBe(2)
  clock.play()
})

test('a still goes through the blend, and without a position stands at the hold of its scene', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AA==')
  const { drawn, blend } = recorder()
  const { container } = render(() => (
    <Stage label="Held" kind="canvas2d" governor={UNGOVERNED} blend={blend}>
      <Scene use={SCENES[0]!} early={0}>
        <h2>a</h2>
      </Scene>
      <Scene use={SCENES[1]!} early={0} hold={0.4} post={{ tear: 1 }}>
        <h2>b</h2>
      </Scene>
    </Stage>
  ))
  await frames()
  const handle = (
    container.querySelector('[data-stage]') as unknown as Record<symbol, StageHandle>
  )[STAGE]!
  log.length = 0
  const png = handle.still(1)
  await frames()
  await expect(png).resolves.toBe('data:image/png;base64,AA==')
  expect(log).toContain('at b 0.40')
  expect(log.filter((l) => l.startsWith('render'))).toEqual([])
  expect(drawn.at(-1)).toMatchObject({ a: 'b', b: 'b', t: 1, options: { post: { tear: 1 } } })
  expect(drawn.at(-1)!.options.levers.taa).toBe(false)
  clock.play()
})

const still = (src: string, width: number, height: number) => ({
  kind: 'photo' as const,
  src,
  width,
  height,
  type: 'image/avif',
  sources: [],
  name: src,
  dominant: '#102030',
})
const BAKED: Record<string, ScenePoster> = {
  b: { desktop: still('/b.desktop.avif', 1440, 900), mobile: still('/b.mobile.avif', 780, 1688) },
}
bakedPosters(BAKED)

function tiered(tier: 'live' | 'poster' | 'auto', governor = UNGOVERNED) {
  return render(() => (
    <Stage label="Two scenes" kind="canvas2d" governor={governor} tier={tier}>
      <Scene id="a" use={SCENES[0]!} poster="#123456">
        <h2>a</h2>
      </Scene>
      <Scene id="b" use={SCENES[1]!} poster="bake">
        <h2>b</h2>
      </Scene>
    </Stage>
  ))
}

test('a scene whose poster is baked shows the one baked for its id: the tall one on a tall screen', async () => {
  const { container } = tiered('live')
  await flush()
  const layer = container.querySelectorAll<HTMLElement>('[data-scene-poster]')[1]!
  expect(layer.style.background).toContain('rgb(16, 32, 48)')
  expect(layer.querySelector('source')!.getAttribute('srcset')).toBe('/b.mobile.avif')
  expect(layer.querySelector('source')!.getAttribute('media')).toBe('(max-aspect-ratio: 1/1)')
  expect(layer.querySelector('img')!.getAttribute('src')).toBe('/b.desktop.avif')
})

test('on the poster tier the stage shows posters only: no surface, and nothing is built', async () => {
  const { container } = tiered('poster')
  await frames()
  const root = container.querySelector<HTMLElement>('[data-stage]')!
  expect(container.querySelector('[data-surface]')).toBeNull()
  expect(root.dataset.stageTier).toBe('poster')
  expect(root.dataset.stageReady).toBe('poster')
  expect(log.filter((l) => l.startsWith('build'))).toEqual([])
  expect(container.querySelectorAll('[data-scene-poster]')).toHaveLength(2)
})

test('auto asks the governor before any surface mounts, and a low tier keeps to posters', async () => {
  let start = () => {}
  const governor = (tier: 'low' | 'high'): StageGovernor => ({
    ...UNGOVERNED,
    tier,
    start: () =>
      new Promise<void>((done) => {
        start = done
      }),
  })
  const low = tiered('auto', governor('low'))
  await frames()
  expect(low.container.querySelector('[data-surface]')).toBeNull()
  start()
  await frames()
  expect(low.container.querySelector('[data-stage]')!.getAttribute('data-stage-tier')).toBe(
    'poster',
  )
  expect(low.container.querySelector('[data-surface]')).toBeNull()
  low.unmount()
  const high = tiered('auto', governor('high'))
  start()
  await frames()
  expect(high.container.querySelector('[data-stage]')!.getAttribute('data-stage-tier')).toBe('live')
  expect(high.container.querySelectorAll('canvas')).toHaveLength(1)
  expect(log).toContain('render a')
})

test('a seek back in time still draws: the fps cap skips only frames that moved forward', async () => {
  page()
  await frames(30)
  clock.pause()
  clock.seek(0)
  log.length = 0
  place([-1.2, -0.2, 0.8, 1.8])
  await frames(40)
  expect(log).toContain('render b')
  clock.play()
})
