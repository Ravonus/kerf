import { Canvas, Slider, type CanvasFrame as Frame } from '@weft/warp'
import { palette } from '@weft/warp-core/dither'
import { state } from 'weft'
import { inks, type ArtProps, type Meta } from './shared'
import code from './token-spectrum.tsx?raw'

export const meta: Meta = { name: 'Token Spectrum', description: 'Every colour warp has, plotted by lightness and chroma, live. Turn the dial, flip the theme or move the seed, and watch the whole system lean together.', kind: 'data', code, wide: true, rest: true }

const FAMILIES = ['accent', 'positive', 'caution', 'critical', 'info', 'highlight', 'neutral'], STEPS = ['soft', 'border', 'text', 'solid', 'solid-hover']
const NAMES = [...FAMILIES.flatMap(f => STEPS.map(s => `${f}-${s}`)), 'page', 'surface', 'surface-sunken', 'surface-raised', 'surface-hover', 'text', 'text-subtle', 'text-faint', 'border', 'border-strong', 'border-control', 'focus', 'sweep', 'data-1', 'data-2', 'data-3', 'data-4', 'data-5', 'data-6', 'data-7', 'data-8']
const TOKENS = NAMES.map(n => `--warp-color-${n}`), COUNT = NAMES.length, FAMILY = STEPS.length
const colours = inks({ rule: '--warp-color-border', axis: '--warp-color-text-faint', label: '--warp-color-text-subtle', hot: '--warp-color-text' })
const MAX_C = 0.3

const linear = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
/** Packed RGBA to OKLCH lightness and chroma: the plane warp's tokens are designed on. */
function oklch(rgba: number) {
  const r = linear(rgba & 255), g = linear((rgba >> 8) & 255), b = linear((rgba >> 16) & 255)
  const l = Math.cbrt(0.4122 * r + 0.5363 * g + 0.0514 * b), m = Math.cbrt(0.2119 * r + 0.6807 * g + 0.1074 * b), s = Math.cbrt(0.0883 * r + 0.2817 * g + 0.6300 * b)
  const L = 0.2104 * l + 0.7936 * m - 0.0040 * s, A = 1.9779 * l - 2.4286 * m + 0.4506 * s, B = 0.0259 * l + 0.7828 * m - 0.8087 * s
  return [L, Math.hypot(A, B)] as const
}
const css = (v: number) => `rgb(${v & 255} ${(v >> 8) & 255} ${(v >> 16) & 255})`

export default function TokenSpectrum(_: ArtProps) {
  const found = state(''), hue = state(152), moving = state(false)
  const ls = new Float32Array(COUNT), cs = new Float32Array(COUNT), tl = new Float32Array(COUNT), tc = new Float32Array(COUNT)
  let fills: string[] = [], stale = true, first = true
  const reread = (el: Element) => {
    const packed = palette(el, TOKENS)
    fills = []
    for (let i = 0; i < COUNT; i++) { const [l, c] = oklch(packed[i]!); tl[i] = l; tc[i] = c; fills.push(css(packed[i]!)) }
    if (first) { ls.set(tl); cs.set(tc); first = false }
    stale = false
  }
  const draw = ({ ctx, width, height, dt, pointer }: Frame) => {
    if (stale) reread(ctx.canvas.parentElement!)
    const c = colours(ctx.canvas), mx = 42, my = 22, w = width - mx * 2, h = height - my * 2 - 12, X = (v: number) => mx + (v / MAX_C) * w, Y = (v: number) => my + (1 - v) * h
    let settling = false
    const k = Math.min(1, (dt || 0.016) * 7)
    for (let i = 0; i < COUNT; i++) {
      ls[i] += (tl[i]! - ls[i]!) * k
      cs[i] += (tc[i]! - cs[i]!) * k
      if (Math.abs(tl[i]! - ls[i]!) + Math.abs(tc[i]! - cs[i]!) > 0.0015) settling = true
    }
    ctx.clearRect(0, 0, width, height)
    ctx.font = '11px var(--warp-font-mono, monospace)'
    ctx.fillStyle = c.rule
    for (let v = 0; v <= 1.001; v += 0.25) ctx.fillRect(mx, Math.round(Y(v)), w, 1)
    for (let v = 0; v <= MAX_C; v += 0.1) ctx.fillRect(Math.round(X(v)), my, 1, h)
    ctx.fillStyle = c.axis
    ctx.fillText('L', 16, my + 10)
    ctx.fillText('chroma →', mx + w - 54, my + h + 16)
    // a family's steps are joined, so a ramp reads as a stroke across the plane
    ctx.lineWidth = 1
    for (let f = 0; f < FAMILIES.length; f++) {
      const base = f * FAMILY
      ctx.strokeStyle = fills[base + 3]!
      ctx.beginPath()
      for (let s = 0; s < 4; s++) { const i = base + s; s ? ctx.lineTo(X(cs[i]!), Y(ls[i]!)) : ctx.moveTo(X(cs[i]!), Y(ls[i]!)) }
      ctx.stroke()
    }
    let near = -1, best = 196
    for (let i = 0; i < COUNT; i++) {
      const x = X(cs[i]!), y = Y(ls[i]!)
      ctx.fillStyle = fills[i]!
      ctx.beginPath()
      ctx.arc(x, y, 5, 0, 6.2832)
      ctx.fill()
      ctx.strokeStyle = c.rule
      ctx.stroke()
      if (pointer.in) { const d = (x - pointer.x) ** 2 + (y - pointer.y) ** 2; if (d < best) { best = d; near = i } }
    }
    if (near >= 0) { ctx.strokeStyle = c.hot; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(cs[near]!), Y(ls[near]!), 8, 0, 6.2832); ctx.stroke() }
    found.value = near >= 0 ? `${NAMES[near]}  L ${ls[near]!.toFixed(3)}  C ${cs[near]!.toFixed(3)}` : ''
    if (!settling && moving.value) moving.value = false
    return settling
  }
  const turn = (v: number) => { hue.value = v; stale = true; moving.value = true }
  return (
    <div data-art="pierce" data-warp="" style={`--warp-seed-accent-h:${hue.value}`}>
      <Canvas draw={draw} animate={moving.value} pointer onTheme={() => { colours.reset(); stale = true }} label="Every warp colour token on the lightness and chroma plane" />
      <div data-art="controls" data-art-end=""><div data-art-seed=""><Slider label="Seed hue" value={hue.value} min={0} max={360} onChange={turn} /></div></div>
      <p data-art="readout">{found.value}</p>
    </div>
  )
}
