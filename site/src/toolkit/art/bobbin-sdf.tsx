import { Canvas, type CanvasFrame as Frame } from '@weft/warp'
import { palette, quantize, tile } from '@weft/warp-core/dither'
import { type ArtProps, type Meta } from './shared'
import code from './bobbin-sdf.tsx?raw'

export const meta: Meta = { name: 'Bobbin SDF', description: 'A ray-marched ring of wound thread, 32 steps a pixel, shaded in nothing but dither inks. Drag to turn it. Turns by itself only at vivid.', kind: 'shader', code }

const { sin, cos, sqrt, abs, atan2 } = Math
const R = 1, r = 0.46, BOUND = R + r + 0.02, STEPS = 32, EYE = 3.4
const SCREEN = tile('bayer4')

export default function BobbinSdf({ live = true }: ArtProps) {
  let tones = new Float32Array(0), out = new Uint32Array(0), image: ImageData | undefined, cells: Uint32Array | undefined
  let spin = 0.7, tilt = 1.02, dragging = false, lx = 0, ly = 0, parity = 0, painted = false

  function shade(px: number, py: number, dw: number, ca: number, sa: number, cb: number, sb: number) {
    // a ray through this pixel, in the ring's own frame
    const ox = 0, oy = 0, oz = -EYE, len = sqrt(px * px + py * py + dw * dw), dx0 = px / len, dy0 = py / len, dz0 = dw / len
    const dy1 = dy0 * ca - dz0 * sa, dz1 = dy0 * sa + dz0 * ca, oy1 = oy * ca - oz * sa, oz1 = oy * sa + oz * ca
    const dx = dx0 * cb + dz1 * sb, dz = -dx0 * sb + dz1 * cb, x0 = ox * cb + oz1 * sb, z0 = -ox * sb + oz1 * cb, y0 = oy1, dy = dy1
    const b = x0 * dx + y0 * dy + z0 * dz, disc = b * b - (x0 * x0 + y0 * y0 + z0 * z0 - BOUND * BOUND)
    if (disc < 0) return 0
    let t = -b - sqrt(disc)
    const far = -b + sqrt(disc)
    for (let i = 0; i < STEPS && t < far; i++) {
      const x = x0 + dx * t, y = y0 + dy * t, z = z0 + dz * t, q = sqrt(x * x + z * z) - R, d = sqrt(q * q + y * y) - r
      if (d < 0.003) {
        const major = atan2(z, x), minor = atan2(y, q), n = sqrt(x * x + z * z) || 1
        const nx = (x / n) * q / r, ny = y / r, nz = (z / n) * q / r
        const light = abs(nx * 0.46 + ny * 0.79 + nz * -0.4), lit = nx * 0.46 + ny * 0.79 + nz * -0.4
        const wind = sin(major * 62 + minor * 1.4), thread = 0.8 + 0.2 * wind, gloss = lit > 0 ? lit * lit * lit * 0.36 * (0.7 + 0.3 * wind) : 0
        return Math.min(1, (0.1 + (lit > 0 ? lit : light * 0.08) * 0.68) * thread + gloss)
      }
      t += d
    }
    return 0
  }

  const draw = ({ ctx, width, height, dt, tier, still, pointer }: Frame) => {
    cells ??= palette(ctx.canvas.parentElement!, ['--warp-color-page', '--warp-color-accent-soft', '--warp-color-accent-border', '--warp-color-accent-text', '--warp-color-text'])
    let fresh = false
    if (!image || image.width !== width || image.height !== height) {
      image = new ImageData(width, height)
      out = new Uint32Array(image.data.buffer)
      tones = new Float32Array(width * height)
      fresh = true
    }
    if (pointer.down) {
      if (dragging) { spin -= (pointer.x - lx) * 0.02; tilt += (pointer.y - ly) * 0.02 }
      dragging = true
      lx = pointer.x
      ly = pointer.y
    } else dragging = false
    const turning = !still && tier.speed >= 0.9
    if (!turning && !dragging && painted && !fresh) return
    if (turning) spin += dt * 0.35
    painted = true
    const ca = cos(tilt), sa = sin(tilt), cb = cos(spin), sb = sin(spin), scale = 2.5 / height, cx = width / 2, cy = height / 2
    // half the rows each frame, in turn: the eye averages them and the budget holds
    const all = fresh || !turning
    for (let y = all ? 0 : parity; y < height; y += all ? 1 : 2) for (let x = 0, i = y * width; x < width; x++, i++) tones[i] = shade((x - cx) * scale, (y - cy) * scale, 2.6, ca, sa, cb, sb)
    parity ^= 1
    quantize(tones, width, height, SCREEN, cells, out)
    ctx.putImageData(image, 0, 0)
  }
  return <Canvas draw={draw} animate={live} cell={3} fps={20} pointer onTheme={() => { cells = undefined; painted = false }} label="A torus of wound thread, ray-marched and dithered" />
}
