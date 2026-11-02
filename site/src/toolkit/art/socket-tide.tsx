import { Canvas, type CanvasFrame as Frame } from '@weft/warp'
import { state } from 'weft'
import { inks, rng, type ArtProps, type Meta } from './shared'
import code from './socket-tide.tsx?raw'

export const meta: Meta = { name: 'Socket Tide', description: 'A day of open connections around a clock, rising with one timezone and falling with the next. Point at an hour to read it. The traffic here is a seeded sample: the site has no public socket to read yet.', kind: 'data', code }

const SLOTS = 288, TAU = Math.PI * 2
const colours = inks({ rule: '--warp-color-border', low: '--warp-color-accent-border', high: '--warp-color-accent-text', hand: '--warp-color-sweep', label: '--warp-color-text-faint' })

const day = (() => {
  const r = rng(24), out = new Float32Array(SLOTS)
  let noise = 0
  for (let i = 0; i < SLOTS; i++) {
    const h = (i / SLOTS) * 24, gauss = (at: number, wide: number) => Math.exp(-(((h - at + 36) % 24 - 12) ** 2) / wide)
    noise = noise * 0.8 + (r() - 0.5) * 0.09
    out[i] = 0.24 + 0.72 * gauss(14, 10) + 0.5 * gauss(21, 7) + 0.26 * gauss(7, 5) + noise
  }
  return out
})()
const scale = 1800, count = (i: number) => Math.round(day[i]! * scale)

export default function SocketTide({ live = true }: ArtProps) {
  const found = state('')
  const draw = ({ ctx, width, height, time, still, pointer }: Frame) => {
    const c = colours(ctx.canvas), cx = width / 2, cy = height / 2, outer = Math.min(width, height) * 0.47, inner = outer * 0.36, span = outer - inner, t = still ? 2 : time
    const dx = pointer.x - cx, dy = pointer.y - cy, at = pointer.in && dx * dx + dy * dy > 400 ? Math.floor((((Math.atan2(dy, dx) + Math.PI / 2 + TAU) % TAU) / TAU) * SLOTS) : -1
    ctx.clearRect(0, 0, width, height)
    ctx.lineWidth = 1
    ctx.strokeStyle = c.rule
    ctx.beginPath()
    for (const k of [0, 0.5, 1]) { ctx.moveTo(cx + inner + span * k, cy); ctx.arc(cx, cy, inner + span * k, 0, TAU) }
    ctx.stroke()
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? c.high : c.low
      ctx.lineWidth = pass ? 1.4 : 1
      ctx.beginPath()
      for (let i = pass ? 0 : 1; i < SLOTS; i += 2) {
        const a = (i / SLOTS) * TAU - Math.PI / 2, swell = Math.sin(a * 3 + t * 0.7) * 0.012 + Math.sin(a * 11 - t * 1.1) * 0.006, r = inner + span * Math.min(1, day[i]! + swell), cos = Math.cos(a), sin = Math.sin(a)
        ctx.moveTo(cx + cos * inner, cy + sin * inner)
        ctx.lineTo(cx + cos * r, cy + sin * r)
      }
      ctx.stroke()
    }
    ctx.fillStyle = c.label
    ctx.font = '11px var(--warp-font-mono, monospace)'
    ctx.textAlign = 'center'
    for (let h = 0; h < 24; h += 6) { const a = (h / 24) * TAU - Math.PI / 2; ctx.fillText(String(h).padStart(2, '0'), cx + Math.cos(a) * inner * 0.74, cy + Math.sin(a) * inner * 0.74 + 4) }
    ctx.textAlign = 'start'
    const hand = at >= 0 ? at : (0.4 * SLOTS + t * 0.5) % SLOTS, a = (hand / SLOTS) * TAU - Math.PI / 2
    ctx.strokeStyle = c.hand
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner)
    ctx.lineTo(cx + Math.cos(a) * (outer + 2), cy + Math.sin(a) * (outer + 2))
    ctx.stroke()
    found.value = at >= 0 ? `${String(Math.floor(at / 12)).padStart(2, '0')}:${String((at % 12) * 5).padStart(2, '0')}  ${count(at).toLocaleString('en')} open` : ''
  }
  return (
    <>
      <Canvas draw={draw} animate={live} fps={30} pointer onTheme={colours.reset} label="A day of socket connections around a clock" />
      <p data-art="readout">{found.value}</p>
      <table data-art="table">
        <caption>Open connections by hour, sample data</caption>
        <thead><tr><th scope="col">Hour</th><th scope="col">Connections</th></tr></thead>
        <tbody>{Array.from({ length: 24 }, (_, h) => <tr key={h}><th scope="row">{h}:00</th><td>{count(h * 12)}</td></tr>)}</tbody>
      </table>
    </>
  )
}
