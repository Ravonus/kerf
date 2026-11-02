import { DitherField } from '@weft-js/warp'
import { rng, clamp, type ArtProps, type Meta } from './shared'
import code from './turing-cloth.tsx?raw'

export const meta: Meta = { name: 'Turing Cloth', description: 'Two chemicals feed and kill each other, and a labyrinth grows out of it, the way a leopard gets its spots. Click to seed.', kind: 'field', code }

const W = 150, H = 94, FEED = 0.037, KILL = 0.06

export default function TuringCloth({ live = true }: ArtProps) {
  let a = new Float32Array(W * H).fill(1), b = new Float32Array(W * H), a2 = new Float32Array(W * H), b2 = new Float32Array(W * H)
  let warm = false, stamp = -1
  const drop = (cx: number, cy: number, r: number) => {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) { const i = ((cy + y + H) % H) * W + ((cx + x + W) % W); a[i] = 0.5; b[i] = 0.5 }
  }
  function step(n: number) {
    for (let s = 0; s < n; s++) {
      for (let y = 0, i = 0; y < H; y++) {
        const up = (y === 0 ? H - 1 : y - 1) * W, down = (y === H - 1 ? 0 : y + 1) * W, here = y * W
        for (let x = 0; x < W; x++, i++) {
          const l = x === 0 ? W - 1 : x - 1, r = x === W - 1 ? 0 : x + 1
          const A = a[i], B = b[i], abb = A * B * B
          a2[i] = A + (a[here + l] + a[here + r] + a[up + x] + a[down + x] - 4 * A) * 0.2 - abb + FEED * (1 - A)
          b2[i] = B + (b[here + l] + b[here + r] + b[up + x] + b[down + x] - 4 * B) * 0.1 + abb - (KILL + FEED) * B
        }
      }
      ;[a, a2] = [a2, a]
      ;[b, b2] = [b2, b]
    }
  }
  const seed = () => { const r = rng(11); for (let i = 0; i < 46; i++) drop((r() * W) | 0, (r() * H) | 0, 2 + ((r() * 3) | 0)); step(1000); warm = true }

  // A field is a pure function of place and time, so a new `t` is what advances the reaction.
  let aspect = 1.6
  const cloth = (x: number, y: number, t: number) => {
    if (!warm) seed()
    if (t !== stamp) { stamp = t; step(2) }
    if (x > aspect) aspect = x
    const fx = (x / aspect) * (W - 1), fy = y * (H - 1), ix = fx | 0, iy = fy | 0, kx = fx - ix, ky = fy - iy
    const i = iy * W + ix, j = i + 1, m = iy < H - 1 ? i + W : i, n = m + 1
    return clamp(((b[i] * (1 - kx) + b[j] * kx) * (1 - ky) + (b[m] * (1 - kx) + b[n] * kx) * ky) * 2.9)
  }
  const press = (e: PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    drop(((e.clientX - r.left) / r.width * W) | 0, ((e.clientY - r.top) / r.height * H) | 0, 3)
  }
  return <DitherField fill kind={cloth} cell={3} gain={1.45} fps={30} seed={1} speed={live ? 1 : 0} onPointerDown={press} label="A labyrinth grown by a reaction and diffusion" />
}
