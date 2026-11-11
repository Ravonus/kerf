// @kerf-js/core/surface (research 33): one paint per change, nothing re-rendered, the mirror, the clock, tokens, SSR.
// kerf-allow T005: the host, canvas and mirror are the contract here, so these tests read them directly
import { state } from '@kerf-js/core'
import {
  render,
  screen,
  flush,
  canvasCalls,
  fakeMeasure,
  touches,
  clock as time,
} from '@kerf-js/core/test'
import { renderToString } from '@kerf-js/core/ssr'
import { clock, defineSurface, integerFit, Surface } from '@kerf-js/core/surface'
import { Sized, Target } from './fixtures/ssr/Surf.tsx?kerf-ssr'

const paints = (c: HTMLCanvasElement, name = 'clearRect') =>
  canvasCalls(c).filter((x) => x.name === name).length
const canvas = () => document.querySelector('canvas')!

test('a box change paints once on the next frame, and re-renders nothing', async () => {
  time.install()
  const level = state(1)
  let setups = 0,
    bodies = 0
  const Bars = defineSurface<{ level: number }, 'canvas2d'>({
    name: 'bars',
    kind: 'canvas2d',
    setup(s, props) {
      setups++
      s.draw(() => s.ctx.fillRect(0, 0, props.level, 1))
    },
  })
  function Page() {
    bodies++
    return <Surface use={Bars} level={level.value} label="Bars" />
  }
  render(Page)
  await flush()
  await time.advance(16)
  const before = paints(canvas(), 'fillRect')
  const work = await touches(async () => {
    level.value = 2
    level.value = 3
    await flush()
    await time.advance(16)
  })
  expect(paints(canvas(), 'fillRect')).toBe(before + 1)
  expect(
    canvasCalls(canvas())
      .filter((c) => c.name === 'fillRect')
      .at(-1)!.args,
  ).toEqual([0, 0, 3, 1])
  expect(work.mutations).toBe(0)
  expect(setups).toBe(1)
  expect(bodies).toBe(1)
})

test('a paint with nothing changed never runs: no frame loop without s.frame', async () => {
  time.install()
  const Still = defineSurface({
    name: 'still',
    kind: 'canvas2d',
    setup(s) {
      s.draw(() => s.ctx.fillRect(0, 0, 1, 1))
    },
  })
  render(Surface as never, { use: Still, label: 'Still' })
  await flush()
  await time.advance(16)
  const n = paints(canvas(), 'fillRect')
  await time.advance(1000)
  expect(paints(canvas(), 'fillRect')).toBe(n)
})

test('s.frame ticks at fps; pause stops it, a box change still repaints, and seek is deterministic', async () => {
  time.install()
  const tint = state(0)
  const seen: number[] = []
  const Spin = defineSurface({
    name: 'spin',
    kind: 'canvas2d',
    fps: 30,
    setup(s) {
      s.frame((t) => {
        void tint.value
        seen.push(t.frame)
      })
    },
  })
  render(Surface as never, { use: Spin, label: 'Spin' })
  await flush()
  clock.seek(0)
  clock.play()
  await time.advance(500)
  expect(seen.length).toBeGreaterThan(5)
  expect(seen.at(-1)).toBeLessThanOrEqual(16)
  clock.pause()
  const held = seen.length
  await time.advance(500)
  expect(seen.length).toBe(held)
  tint.value = 1
  await flush()
  await time.advance(16)
  expect(seen.length).toBe(held + 1)
  clock.seek(2)
  expect(seen.at(-1)).toBe(60)
  clock.play()
})

test('s.text keeps a real mirror: one DOM write per change, and the canvas paints what the mirror says', async () => {
  time.install()
  const score = state(1)
  const Hud = defineSurface({
    name: 'hud',
    kind: 'canvas2d',
    setup(s) {
      s.text(() => `Score ${score.value}`, {
        x: 4,
        y: 8,
        width: 200,
        font: '16px Inter',
        lineHeight: 20,
      })
    },
  })
  render(
    Surface as never,
    { use: Hud, label: 'Game' },
    { slots: { 'text.measure': fakeMeasure() } },
  )
  await flush()
  await time.advance(16)
  await flush()
  await time.advance(16)
  expect(screen.getByText('Score 1').tagName).toBe('P')
  expect(
    canvasCalls(canvas())
      .filter((c) => c.name === 'fillText')
      .at(-1)!.args[0],
  ).toBe('Score 1')
  const work = await touches(async () => {
    score.value = 2
    await flush()
  })
  expect(work.mutations).toBe(1)
  await time.advance(16)
  await flush()
  await time.advance(16)
  expect(
    canvasCalls(canvas())
      .filter((c) => c.name === 'fillText')
      .at(-1)!.args[0],
  ).toBe('Score 2')
  // A translator rewrites the mirror's text node: the canvas follows.
  screen.getByText('Score 2').firstChild!.nodeValue = 'Punkte 2'
  await flush()
  await time.advance(16)
  await flush()
  await time.advance(16)
  expect(
    canvasCalls(canvas())
      .filter((c) => c.name === 'fillText')
      .at(-1)!.args[0],
  ).toBe('Punkte 2')
})

test('s.text wraps through the provider and stacks lines by line height', async () => {
  time.install()
  const Wrap = defineSurface({
    name: 'wrap',
    kind: 'canvas2d',
    setup(s) {
      s.text('aaaa bbbb cccc', { x: 0, y: 10, width: 48, font: '16px Inter', lineHeight: 20 })
    },
  })
  render(
    Surface as never,
    { use: Wrap, label: 'Text' },
    { slots: { 'text.measure': fakeMeasure() } },
  )
  await flush()
  await time.advance(16)
  await flush()
  await time.advance(16)
  const drawn = canvasCalls(canvas())
    .filter((c) => c.name === 'fillText')
    .slice(-3)
  expect(drawn.map((c) => c.args[0])).toEqual(['aaaa', 'bbbb', 'cccc'])
  expect((drawn[1]!.args[2] as number) - (drawn[0]!.args[2] as number)).toBe(20)
})

test('on webgl2 there is no text path: the mirror itself is visible and nothing measures', async () => {
  const Gl = defineSurface({
    name: 'gl',
    kind: 'webgl2',
    setup(s) {
      s.text('Hello', { x: 0, y: 0, width: 100, color: 'white' })
    },
  })
  render(Surface as never, { use: Gl, label: 'Scene' })
  await flush()
  expect(screen.getByText('Hello').style.color).toBe('white')
})

test('label names the canvas, decorative hides it, and both are live', async () => {
  const name = state('First')
  const quiet = state(false)
  const S = defineSurface({ name: 's', kind: 'canvas2d', setup() {} })
  function Page() {
    return <Surface use={S} label={name.value} decorative={quiet.value} />
  }
  render(Page)
  await flush()
  expect(screen.getByRole('img', { name: 'First' })).toBeTruthy()
  name.value = 'Second'
  await flush()
  expect(screen.getByRole('img', { name: 'Second' })).toBeTruthy()
  quiet.value = true
  await flush()
  expect(screen.queryByRole('img')).toBeNull()
})

test('setup cleanup runs on unmount and the canvas goes with it', async () => {
  let cleaned = 0
  const S = defineSurface({
    name: 's',
    kind: 'webgl2',
    setup() {
      return () => cleaned++
    },
  })
  const { unmount } = render(Surface as never, { use: S, label: 'x' })
  await flush()
  unmount()
  expect(cleaned).toBe(1)
  expect(document.querySelector('canvas')).toBeNull()
})

test('a theme change repaints with the token read again', async () => {
  time.install()
  const seen: string[] = []
  const S = defineSurface({
    name: 't',
    kind: 'canvas2d',
    setup(s) {
      s.draw(() => {
        seen.push(s.tokens.accentStrong!.css)
        s.ctx.fillRect(0, 0, 1, 1)
      })
    },
  })
  render(Surface as never, { use: S, label: 't' })
  await flush()
  await time.advance(16)
  expect(seen.at(-1)).toContain('--accent-strong') // jsdom doesn't resolve var(); the e2e does
  const painted = seen.length
  document.documentElement.setAttribute('data-theme', 'dark')
  await flush()
  await time.advance(16)
  document.documentElement.removeAttribute('data-theme')
  expect(seen.length).toBeGreaterThan(painted)
})

test('a surface paints once on mount, not twice', async () => {
  time.install()
  const S = defineSurface({
    name: 'once',
    kind: 'canvas2d',
    setup(s) {
      s.draw(() => s.ctx.fillRect(0, 0, 1, 1))
    },
  })
  render(Surface as never, { use: S, label: 'x' })
  await flush()
  await time.advance(100)
  expect(paints(canvas(), 'fillRect')).toBe(1)
})

test('WebGL context loss tears setup down, and restoring runs it again', async () => {
  let setups = 0,
    cleaned = 0
  const S = defineSurface({
    name: 's',
    kind: 'webgl2',
    setup() {
      setups++
      return () => cleaned++
    },
  })
  render(Surface as never, { use: S, label: 'x' })
  await flush()
  const lost = new Event('webglcontextlost', { cancelable: true })
  canvas().dispatchEvent(lost)
  expect(lost.defaultPrevented).toBe(true)
  expect(cleaned).toBe(1)
  canvas().dispatchEvent(new Event('webglcontextrestored'))
  expect(setups).toBe(2)
})

test('a page that owns the pixel ratio changes it without a resize', async () => {
  const ratio = vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(3)
  const rect = vi
    .spyOn(Element.prototype, 'getBoundingClientRect')
    .mockReturnValue({ width: 100, height: 50 } as DOMRect)
  const cap = state(1)
  let dpr = 0
  const Sharp = defineSurface({
    name: 'sharp',
    kind: 'canvas2d',
    maxDpr: cap,
    setup(s) {
      s.draw(() => (dpr = s.dpr.value))
    },
  })
  render(() => <Surface use={Sharp} label="Sharp" />)
  await flush()
  expect([canvas().width, canvas().height, dpr]).toEqual([100, 50, 1])
  cap.value = 2.5
  await flush()
  expect([canvas().width, canvas().height]).toEqual([250, 125])
  rect.mockRestore()
  ratio.mockRestore()
})

test('the server renders the sized host and no canvas', () => {
  const html = renderToString(Sized)
  expect(html).toContain('data-surface="stars"')
  expect(html).toContain('aspect-ratio:16/9')
  expect(html).not.toContain('canvas')
})

test('a pixel surface takes its ratio from the target', () => {
  expect(renderToString(Target)).toContain('aspect-ratio:256/144')
})

test("integerFit is Keel's: the largest whole scale, never under 1", () => {
  expect(integerFit(256, 144, 800, 600)).toEqual({
    scale: 3,
    width: 768,
    height: 432,
    overflow: false,
  })
  expect(integerFit(256, 144, 100, 100)).toMatchObject({ scale: 1, overflow: true })
})

test('a kind with no provider is P101, on the host and in the console', async () => {
  const errors: unknown[] = []
  const spy = vi.spyOn(console, 'error').mockImplementation((e) => {
    errors.push(e)
  })
  const S = defineSurface({ name: 'k', kind: 'keel-pixel', setup() {} })
  render(Surface as never, { use: S, label: 'k' })
  await new Promise<void>((done) => {
    const seen = new MutationObserver(() => {
      if (document.querySelector('[data-surface-error]')) {
        seen.disconnect()
        done()
      }
    })
    seen.observe(document.body, { subtree: true, attributes: true })
  })
  spy.mockRestore()
  expect((errors[0] as Error).message).toContain('P101 surface.renderer')
})

test('dev validates props against the schema', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const schema = {
    '~standard': {
      version: 1,
      vendor: 't',
      validate: (v: unknown) =>
        (v as { n: number }).n > 1
          ? { issues: [{ message: 'too big', path: ['n'] }] }
          : { value: v as { n: number } },
    },
  }
  const n = state(0)
  const S = defineSurface<{ n: number }>({ name: 'v', kind: 'canvas2d', props: schema, setup() {} })
  function Page() {
    return <Surface use={S} n={n.value} label="v" />
  }
  render(Page)
  await flush()
  expect(warn).not.toHaveBeenCalled()
  n.value = 2
  await flush()
  expect(String(warn.mock.calls[0]![0])).toContain('`n`: too big')
  warn.mockRestore()
})

function mirrorFixture() {
  const warnings = async (build: () => unknown, extra?: () => void) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    time.install()
    extra?.()
    render(build, {}, { slots: { 'text.measure': fakeMeasure() } })
    await flush()
    await time.advance(16)
    await flush()
    await time.advance(16)
    const seen = warn.mock.calls.map((c) => String(c[0]))
    warn.mockRestore()
    return seen
  }
  const surface = (text: string, options: object) =>
    defineSurface({
      name: 'd',
      kind: 'canvas2d',
      setup(s) {
        s.text(text, { x: 0, y: 0, width: 200, ...options })
      },
    })

  return { warnings, surface }
}

function registerMirrorMismatch({ warnings, surface }: ReturnType<typeof mirrorFixture>) {
  test('X001: the rendered mirror differs from the prediction', async () => {
    const S = surface('drift one', { font: '16px Inter', lineHeight: 20 })
    const rect = vi
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockReturnValue({ width: 200, height: 60 } as DOMRect)
    const seen = await warnings(() => <Surface use={S} label="x" />)
    rect.mockRestore()
    expect(seen.some((m) => m.includes('X001') && m.includes('predicted 20 px'))).toBe(true)
  })

  test('X001 stays quiet with exact: false, and when they agree', async () => {
    const S = surface('drift two', { font: '16px Inter', lineHeight: 20, exact: false })
    const T = surface('drift three', { font: '16px Inter', lineHeight: 20 })
    const rect = vi
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockReturnValue({ width: 200, height: 20 } as DOMRect)
    const seen = await warnings(() => (
      <>
        <Surface use={S} label="x" />
        <Surface use={T} label="y" />
      </>
    ))
    rect.mockRestore()
    expect(seen.filter((m) => m.includes('X001'))).toEqual([])
  })

  test('X002: a system family, however it arrived', async () => {
    const S = surface('family', { font: '16px system-ui' })
    expect(
      (await warnings(() => <Surface use={S} label="x" />)).some((m) => m.includes('X002')),
    ).toBe(true)
  })
}

function registerMirrorWarnings({ warnings, surface }: ReturnType<typeof mirrorFixture>) {
  test("X003: the font isn't loaded and there is no fallback face", async () => {
    const S = surface('loading', { font: '16px Brand' })
    const fonts = Object.assign([], {
      check: () => false,
      load: () => Promise.resolve([]),
      addEventListener() {},
    })
    Object.defineProperty(document, 'fonts', { value: fonts, configurable: true })
    const seen = await warnings(() => <Surface use={S} label="x" />)
    Reflect.deleteProperty(document, 'fonts')
    expect(seen.some((m) => m.includes('X003') && m.includes('"Brand Fallback"'))).toBe(true)
  })

  test("X004: a style line breaking can't predict, and exact: false silences it", async () => {
    const style = document.head.appendChild(document.createElement('style'))
    style.textContent = '.fancy { word-spacing: 4px }'
    const S = surface('fancy', { font: '16px Inter', class: 'fancy' })
    const T = surface('fancy too', { font: '16px Inter', class: 'fancy', exact: false })
    const seen = await warnings(() => (
      <>
        <Surface use={S} label="x" />
        <Surface use={T} label="y" />
      </>
    ))
    style.remove()
    expect(seen.filter((m) => m.includes('X004'))).toHaveLength(1)
  })

  test('X011: an ancestor hides the mirror', async () => {
    const S = surface('hidden', { font: '16px Inter' })
    const seen = await warnings(() => (
      <div aria-hidden="true">
        <Surface use={S} label="x" />
      </div>
    ))
    expect(seen.some((m) => m.includes('X011'))).toBe(true)
  })
}

describe('dev checks on the live mirror', () => {
  const fixture = mirrorFixture()
  registerMirrorMismatch(fixture)
  registerMirrorWarnings(fixture)
})
