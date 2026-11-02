import { Canvas, type CanvasFrame as Frame } from '@weft-js/warp'
import { palette } from '@weft-js/warp-core/dither'
import { rng, type ArtProps, type Meta } from './shared'
import code from './draft.tsx?raw'

export const meta: Meta = { name: 'Draft', description: 'A real weaving drawdown. Threading along the top, tie-up in the corner, treadling down the side, and the cloth they make is whatever those three arrays say. This is how weavers wrote it down.', kind: 'generative', code, wide: true }

const SHAFTS = 8, PITCH = 3, RULE = 2
const SEED = 8

/** A point twill threading: up and down the shafts, with a longer run every so often, which is what makes the diamonds. */
function threading(n: number) {
  const out = new Uint8Array(n), r = rng(SEED)
  let at = 0, dir = 1, run = 3 + ((r() * 6) | 0)
  for (let i = 0; i < n; i++) {
    out[i] = at
    if (--run < 0) { dir = -dir; run = 3 + ((r() * 6) | 0) }
    at = (at + dir + SHAFTS) % SHAFTS
  }
  return out
}
// 2/2/1/3 twill on eight shafts: each treadle lifts a run of them.
const TIE = Array.from({ length: SHAFTS }, (_, t) => Array.from({ length: SHAFTS }, (_, s) => { const k = (s - t + SHAFTS) % SHAFTS; return k < 2 || k === 3 ? 1 : 0 }))

export default function Draft({ live = true }: ArtProps) {
  let image: ImageData | undefined, out = new Uint32Array(0), inksNow: Uint32Array | undefined, thread = new Uint8Array(0), cols = 0
  const treadle = (y: number) => { const k = ((y % 52) + 52) % 52, up = k < 26 ? k : 51 - k; return (up + (y >> 6)) % SHAFTS }

  const draw = ({ ctx, width, height, time, tier, still }: Frame) => {
    if (!inksNow) inksNow = palette(ctx.canvas.parentElement!, ['--warp-color-page', '--warp-color-accent-text', '--warp-color-accent-soft', '--warp-color-border-strong', '--warp-color-text'])
    const [ground, warp, weft, rule, mark] = inksNow as unknown as number[]
    if (!image || image.width !== width || image.height !== height) {
      image = new ImageData(width, height)
      out = new Uint32Array(image.data.buffer)
      cols = Math.ceil(width / PITCH)
      thread = threading(cols)
    }
    out.fill(ground!)
    const margin = SHAFTS * PITCH + RULE * 2, right = width - margin, shift = Math.floor((still ? 24 : 24 + time * (2 + tier.speed * 6)))
    const span = Math.floor(right / PITCH)
    const set = (x: number, y: number, ink: number) => { for (let b = 0; b < PITCH - 1; b++) for (let a = 0; a < PITCH - 1; a++) out[(y + b) * width + x + a] = ink }
    // threading
    for (let x = 0; x < span; x++) set(x * PITCH, (SHAFTS - 1 - thread[x]!) * PITCH + RULE, mark!)
    // tie-up
    for (let t = 0; t < SHAFTS; t++) for (let s = 0; s < SHAFTS; s++) if (TIE[t]![s]) set(right + RULE + t * PITCH, (SHAFTS - 1 - s) * PITCH + RULE, mark!)
    const top = margin, rows = Math.floor((height - top) / PITCH)
    for (let y = 0; y < rows; y++) {
      const row = y + shift, tr = treadle(row), tie = TIE[tr]!
      // treadling, and the cloth: a warp thread on top wherever its shaft is tied to this row's treadle
      set(right + RULE + tr * PITCH, top + y * PITCH, mark!)
      for (let x = 0; x < span; x++) {
        const lifted = tie[thread[x]!]
        const ink = lifted ? warp! : weft!, px = x * PITCH, py = top + y * PITCH
        for (let b = 0; b < PITCH; b++) for (let a = 0; a < PITCH; a++) out[(py + b) * width + px + a] = ink
      }
    }
    for (let x = 0; x < width; x++) out[(margin - 1) * width + x] = rule!
    for (let y = 0; y < height; y++) out[y * width + right] = rule!
    ctx.putImageData(image, 0, 0)
  }
  return <Canvas draw={draw} animate={live} cell={2} fps={12} onTheme={() => { inksNow = undefined }} label="A weaving drawdown scrolling past, with its threading, tie-up and treadling" />
}
