import { Canvas, type CanvasFrame as Frame } from '@kerf-js/veneer'
import { state } from '@kerf-js/core'
import { clamp, inks, rng, type ArtProps, type Meta } from './shared'
import code from './latency-rain.tsx?raw'

export const meta: Meta = {
  name: 'Latency Rain',
  description:
    'Each request falls as far as it took. The p50 and p95 sit as rules across the rain, and only an error gets a colour. Brush a window to read it. The requests here are a seeded sample.',
  kind: 'data',
  code,
  wide: true,
}

const COUNT = 900,
  MAX = 1000,
  LIFE = 9
const colours = inks({
  drop: '--veneer-color-data-1',
  fine: '--veneer-color-text-faint',
  err: '--veneer-color-critical-text',
  rule: '--veneer-color-text-subtle',
  band: '--veneer-color-accent-soft',
  ground: '--veneer-color-page',
})

// log-normal around 80 ms, with the long tail every real service has, and one bad patch
const r = rng(404)
const requests = Array.from({ length: COUNT }, () => {
  const at = r(),
    normal = Math.sqrt(-2 * Math.log(r() || 0.001)) * Math.cos(6.283 * r()),
    bad = at > 0.62 && at < 0.7
  const ms = Math.min(MAX, Math.exp(4.4 + normal * 0.7 + (bad ? 0.9 : 0)))
  return { at, ms, error: r() < (bad ? 0.14 : 0.004), phase: r() }
}).sort((a, b) => a.at - b.at)

const percentile = (list: number[], q: number) => {
  const s = [...list].sort((a, b) => a - b)
  return s[Math.floor((s.length - 1) * q)] ?? 0
}
const whole = requests.map((q) => q.ms),
  p50 = percentile(whole, 0.5),
  p95 = percentile(whole, 0.95),
  fails = requests.filter((q) => q.error).length

export default function LatencyRain({ live = true }: ArtProps) {
  const found = state('')
  const draw = rainDrawing(found)
  return (
    <>
      <Canvas
        draw={draw}
        animate={live}
        fps={30}
        pointer
        style="touch-action:pan-y;cursor:crosshair"
        onTheme={colours.reset}
        label="Requests falling as streaks, length by latency"
      />
      <p data-art="readout">{found.value}</p>
      <table data-art="table">
        <caption>Latency summary, sample data</caption>
        <thead>
          <tr>
            <th scope="col">Measure</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Requests</th>
            <td>{COUNT}</td>
          </tr>
          <tr>
            <th scope="row">p50</th>
            <td>{Math.round(p50)} ms</td>
          </tr>
          <tr>
            <th scope="row">p95</th>
            <td>{Math.round(p95)} ms</td>
          </tr>
          <tr>
            <th scope="row">Errors</th>
            <td>{fails}</td>
          </tr>
        </tbody>
      </table>
    </>
  )
}

type Rain = {
  clock: number
  span: number
  top: number
  mx: number
  inner: number
  scale: (ms: number) => number
}

function drawRequests(ctx: CanvasRenderingContext2D, c: ReturnType<typeof colours>, rain: Rain) {
  const { clock, span, top, mx, inner, scale } = rain
  for (let pass = 0; pass < 3; pass++) {
    ctx.fillStyle = pass === 2 ? c.err : pass ? c.drop : c.fine
    ctx.beginPath()
    for (let i = 0; i < COUNT; i++) {
      const q = requests[i]!
      if (
        +q.error * 2 !== pass &&
        !(pass === 1 && !q.error && q.ms > p50) &&
        !(pass === 0 && !q.error && q.ms <= p50)
      )
        continue
      if (pass === 2 && !q.error) continue
      if (pass < 2 && q.error) continue
      const age = (clock / LIFE + q.phase) % 1,
        fall = Math.min(1, age * 3.2),
        reach = scale(q.ms) * span,
        tail = Math.min(reach, 12 + reach * 0.42)
      const y = top + reach * fall,
        x = mx + q.at * inner
      ctx.rect(x, y - tail * fall, pass === 2 ? 2 : 1, tail * fall)
    }
    ctx.fill()
  }
}

function rainDrawing(found: ReturnType<typeof state<string>>) {
  let from = -1,
    to = -1,
    wasDown = false
  const scale = (ms: number) => Math.log(1 + ms) / Math.log(1 + MAX)
  return ({ ctx, width, height, time, still, pointer }: Frame) => {
    const c = colours(ctx.canvas),
      mx = 18,
      top = 14,
      bottom = height - 14,
      span = bottom - top,
      inner = width - mx * 2,
      clock = still ? 6.7 : time
    if (pointer.down) {
      const u = clamp((pointer.x - mx) / inner)
      if (!wasDown) from = u
      to = u
      const a = Math.min(from, to),
        b = Math.max(from, to),
        list = requests.filter((q) => q.at >= a && q.at <= b).map((q) => q.ms)
      if (list.length > 2)
        found.value = `${list.length} requests · p50 ${Math.round(percentile(list, 0.5))} ms · p95 ${Math.round(percentile(list, 0.95))} ms`
    }
    wasDown = pointer.down
    ctx.clearRect(0, 0, width, height)
    if (from >= 0) {
      ctx.fillStyle = c.band
      ctx.fillRect(mx + Math.min(from, to) * inner, top, Math.abs(to - from) * inner, span)
    }
    drawRequests(ctx, c, { clock, span, top, mx, inner, scale })
    ctx.fillStyle = c.rule
    ctx.font = '11px var(--veneer-font-mono, monospace)'
    for (const [name, value] of [
      ['p50', p50],
      ['p95', p95],
    ] as const) {
      const y = Math.round(top + scale(value) * span)
      const text = `${name} ${Math.round(value)} ms`
      ctx.fillRect(mx, y, inner, 1)
      ctx.fillStyle = c.ground
      ctx.fillRect(mx, y - 17, ctx.measureText(text).width + 8, 16)
      ctx.fillStyle = c.rule
      ctx.fillText(text, mx + 4, y - 5)
    }
  }
}
