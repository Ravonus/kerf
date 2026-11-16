// A paint-only frame must not resolve CSS again; theme and colour edits still refresh the palette.
import { canvas } from '../src/canvas'
import { BAR_DEFAULTS } from '../src/options'
import type { BarFrame } from '../src/types'

function fixture() {
  const track = document.createElement('div')
  document.body.append(track)
  const ctx = { setTransform: vi.fn(), clearRect: vi.fn() }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  )
  const paint = vi.fn()
  const renderer = canvas({ draw: paint })
  renderer.mount(track, 'y')
  const frame: BarFrame = {
    axis: 'y',
    track: { width: 10, height: 300 },
    thumb: { x: 0, y: 0, width: 6, height: 30 },
    grow: 0,
    hover: false,
    active: false,
    progress: 0,
    span: { start: 0, end: 270 },
    rtl: false,
    bar: { ...BAR_DEFAULTS },
  }
  return { track, frame, renderer, paint }
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

test('equivalent fresh bar objects and geometry changes reuse colours without style reads', () => {
  const { track, frame, renderer, paint } = fixture()
  const styles = vi.spyOn(globalThis, 'getComputedStyle')
  renderer.draw(track, frame)
  const initial = styles.mock.calls.length
  expect(initial).toBe(5)
  for (let i = 0; i < 20; i++)
    renderer.draw(track, { ...frame, bar: { ...frame.bar, width: 8 }, progress: i / 20 })
  expect(styles).toHaveBeenCalledTimes(initial)
  expect(paint.mock.calls.at(-1)?.[1].bar.width).toBe(8)
  frame.bar.color = 'red'
  renderer.draw(track, frame)
  expect(styles).toHaveBeenCalledTimes(initial + 5)
  renderer.unmount(track)
})

test('ancestor theme changes refresh once while unrelated DOM animation does not', async () => {
  const { track, frame, renderer } = fixture()
  const styles = vi.spyOn(globalThis, 'getComputedStyle')
  renderer.draw(track, frame)
  const other = document.createElement('div')
  document.body.append(other)
  other.style.transform = 'translateX(10px)'
  await Promise.resolve()
  renderer.draw(track, frame)
  expect(styles).toHaveBeenCalledTimes(5)
  document.documentElement.style.setProperty('--scroll-color', 'pink')
  await Promise.resolve()
  renderer.draw(track, frame)
  renderer.draw(track, frame)
  expect(styles).toHaveBeenCalledTimes(10)
  renderer.unmount(track)
  document.documentElement.style.removeProperty('--scroll-color')
})
