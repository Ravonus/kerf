import { DitherField } from '@weft-js/warp'
import { state } from '@weft-js/core'
import { clamp, type ArtProps, type Meta } from './shared'
import code from './sand-table.tsx?raw'

export const meta: Meta = { name: 'Sand Table', description: 'A raked garden. Draw through it and the sand piles up along your groove, then slowly finds its way back.', kind: 'pointer', code, rest: true }

const W = 170, H = 106, STONES = [[0.3, 0.42, 0.11], [0.72, 0.62, 0.075], [0.56, 0.2, 0.04]] as const

export default function SandTable(_: ArtProps) {
  const rake = new Float32Array(W * H), sand = new Float32Array(W * H), rock = new Uint8Array(W * H), shade = new Float32Array(W * H)
  const busy = state(false)
  let aspect = 1.6, stamp = NaN, built = false, lx = -1, ly = -1, restless = 0

  function build() {
    for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
      const u = (x / W) * 1.6, v = y / H
      let near = 9, stone = -1
      STONES.forEach(([sx, sy, r], n) => { const d = Math.hypot(u - sx * 1.6, v - sy) - r; if (d < near) { near = d; stone = n } })
      // rings round each stone give way to straight rows, as a rake does
      const rows = Math.sin(v * 2 * Math.PI * 11), rings = Math.sin(near * 2 * Math.PI * 11 + stone), k = clamp((near - 0.2) / 0.09)
      rake[i] = sand[i] = (rings * (1 - k) + rows * k) * 0.5
      rock[i] = near < 0 ? 1 : 0
    }
    relight()
    built = true
  }
  function relight() {
    for (let y = 1; y < H - 1; y++) for (let x = 1, i = y * W + 1; x < W - 1; x++, i++) shade[i] = rock[i] ? 1 : clamp(0.44 + (sand[i - 1]! - sand[i + 1]! + sand[i - W]! - sand[i + W]!) * 0.26)
  }
  function settle() {
    let moved = 0
    for (let y = 1; y < H - 1; y++) for (let x = 1, i = y * W + 1; x < W - 1; x++, i++) {
      const d = rake[i]! - sand[i]!
      if (Math.abs(d) < 0.004) continue
      moved++
      sand[i] += d * 0.012 + (sand[i - 1]! + sand[i + 1]! + sand[i - W]! + sand[i + W]! - 4 * sand[i]!) * 0.05
    }
    return moved
  }
  const garden = (x: number, y: number, t: number) => {
    if (!built) build()
    if (x > aspect) aspect = x
    if (t !== stamp) {
      stamp = t
      if (settle() < 40 && --restless < 0) busy.value = false
      relight()
    }
    return shade[(Math.min(H - 1, (y * H) | 0)) * W + Math.min(W - 1, ((x / aspect) * W) | 0)]!
  }
  function plough(px: number, py: number) {
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
      const X = px + dx, Y = py + dy, d = Math.hypot(dx, dy)
      if (X < 1 || Y < 1 || X >= W - 1 || Y >= H - 1 || d > 5) continue
      const i = Y * W + X
      if (!rock[i]) sand[i] = d < 2.6 ? -1 : d < 4.4 ? Math.max(sand[i]!, 0.9) : sand[i]!
    }
  }
  const move = (e: PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect(), x = ((e.clientX - r.left) / r.width * W) | 0, y = ((e.clientY - r.top) / r.height * H) | 0, steps = lx < 0 ? 1 : Math.max(1, Math.hypot(x - lx, y - ly) | 0)
    for (let n = 1; n <= steps; n++) plough(lx < 0 ? x : Math.round(lx + ((x - lx) * n) / steps), lx < 0 ? y : Math.round(ly + ((y - ly) * n) / steps))
    lx = x
    ly = y
    restless = 30
    busy.value = true
  }
  return <DitherField fill kind={garden} ramp="neutral" pattern="blue" cell={3} spread={0.9} gain={1.25} seed={2} speed={busy.value ? 1 : 0} onPointerMove={move} onPointerLeave={() => { lx = -1 }} style="touch-action:none" label="A raked sand garden around three stones" />
}
