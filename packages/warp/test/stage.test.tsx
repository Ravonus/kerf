// The scene stage on a page: sections in order, posters under one pinned canvas, the active scene and its
// neighbours built, far scenes freed, the cut at 0.5 and the governor's pixel ratio. Positions come from mocked
// section boxes; the scenes are stand-ins that log what the stage asks of them.
import { renderToString } from '@weft-js/core/ssr'
import { clock } from '@weft-js/core/surface'
import { clock as time, flush, render } from '@weft-js/core/test'
import { Scene, Stage, type StageGovernor, type StageSceneDef } from '@weft-js/warp/scenes'
import { FULL } from '@weft-js/warp-core/scenes'

const log: string[] = []
const scene = (name: string): StageSceneDef => ({
  build({ seed }) {
    log.push(`build ${name} ${seed}`)
    return Promise.resolve({
      at: (position) => log.push(`at ${name} ${position.toFixed(2)}`),
      setQuality: (levers) => log.push(`quality ${name} ${levers.density}`),
      render: () => log.push(`render ${name}`),
      dispose: () => log.push(`dispose ${name}`),
    })
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

function page(governor: StageGovernor = UNGOVERNED) {
  return render(() => (
    <Stage label="Four scenes" kind="canvas2d" governor={governor}>
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
  expect(html.match(/data-scene-poster/g)).toHaveLength(2)
  expect(html).toContain('url(&quot;/second.avif&quot;)')
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
