import { Canvas, type CanvasFrame as Frame } from '@kerf-js/veneer'
import { state, watch } from '@kerf-js/core'
import { inks, type ArtProps, type Meta } from './shared'
import code from './long-thread.tsx?raw'

export const meta: Meta = {
  name: 'Long Thread',
  description:
    'One unbroken Hilbert curve, 4,096 points long, that visits every square of the card and never crosses itself. It lays itself down again each time you come back.',
  kind: 'generative',
  code,
}

const ORDER = 6,
  SIDE = 1 << ORDER,
  TOTAL = SIDE * SIDE,
  RATE = 760
const colours = inks({
  line: '--veneer-color-text-subtle',
  head: '--veneer-color-sweep',
  tail: '--veneer-color-accent-text',
})

/** The classic index-to-point walk, by rotating quadrants. */
function point(d: number) {
  let rx: number,
    ry: number,
    x = 0,
    y = 0,
    t = d
  for (let s = 1; s < SIDE; s *= 2) {
    rx = 1 & (t / 2)
    ry = 1 & (t ^ rx)
    if (ry === 0) {
      if (rx === 1) {
        x = s - 1 - x
        y = s - 1 - y
      }
      ;[x, y] = [y, x]
    }
    x += s * rx
    y += s * ry
    t = (t / 4) | 0
  }
  return [x, y] as const
}
const points = Array.from({ length: TOTAL }, (_, d) => point(d))

export default function LongThread({ live = true }: ArtProps) {
  const running = state(true)
  let shown = 0,
    sheet: HTMLCanvasElement | undefined,
    sizedFor = ''
  watch(
    () => live,
    (on) => {
      if (on) {
        shown = 0
        sizedFor = ''
        running.value = true
      }
    },
  )

  const place = (width: number, height: number) => {
    const m = 16,
      ux = (width - m * 2) / (SIDE - 1),
      uy = (height - m * 2) / (SIDE - 1)
    return (d: number) => [m + points[d]![0] * ux, m + points[d]![1] * uy] as const
  }
  const draw = ({ ctx, width, height, dpr, dt, still }: Frame) => {
    const c = colours(ctx.canvas),
      at = place(width, height),
      key = `${width}x${height}x${dpr}`
    if (key !== sizedFor) {
      sizedFor = key
      sheet = document.createElement('canvas')
      sheet.width = width * dpr
      sheet.height = height * dpr
      sheet.getContext('2d')!.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (shown) shown = 0
    }
    const g = sheet!.getContext('2d')!,
      target = still ? TOTAL : Math.min(TOTAL, shown + Math.max(1, dt * RATE))
    g.strokeStyle = c.line
    g.lineWidth = 1
    g.lineJoin = 'round'
    g.beginPath()
    for (let d = Math.max(1, Math.floor(shown)); d < target; d++) {
      const [ax, ay] = at(d - 1),
        [bx, by] = at(d)
      g.moveTo(ax, ay)
      g.lineTo(bx, by)
    }
    g.stroke()
    shown = target
    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(sheet!, 0, 0, width, height)
    if (shown < TOTAL) {
      ctx.lineWidth = 1.5
      ctx.lineJoin = 'round'
      ctx.strokeStyle = c.tail
      ctx.beginPath()
      const end = Math.floor(shown),
        from = Math.max(0, end - 40)
      for (let d = from; d < end; d++) {
        const [x, y] = at(d)
        d === from ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.stroke()
      const [hx, hy] = at(end)
      ctx.fillStyle = c.head
      ctx.fillRect(hx - 2.5, hy - 2.5, 5, 5)
    } else if (running.value) running.value = false
  }
  return (
    <Canvas
      draw={draw}
      animate={live && running.value}
      onTheme={() => {
        colours.reset()
        sizedFor = ''
      }}
      label="A single Hilbert curve filling the card"
    />
  )
}
