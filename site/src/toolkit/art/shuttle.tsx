import { Canvas, type CanvasFrame as Frame } from '@weft/warp'
import { state } from 'weft'
import { inks, type ArtProps, type Meta } from './shared'
import code from './shuttle.tsx?raw'

export const meta: Meta = { name: 'Shuttle', description: 'One stroke crosses the warps and leaves one woven row behind it. It never rewinds. Hover to hurry it along.', kind: 'generative', code, wide: true }

const PITCH = 5, ROW = 4
const colours = inks({ warp: '--warp-color-border-strong', soft: '--warp-color-accent-border', ink: '--warp-color-accent-text', deep: '--warp-color-text', sweep: '--warp-color-sweep', ground: '--warp-color-page' })

/** Which of the weft's colours row `r` takes: broad bands, like a blanket's stripes. */
const band = (r: number) => { const k = (r % 64) / 64; return k < 0.44 ? 0 : k < 0.5 ? 2 : k < 0.72 ? 1 : k < 0.75 ? 2 : k < 0.94 ? 0 : 1 }

export default function Shuttle({ live = true }: ArtProps) {
  let cloth: HTMLCanvasElement | undefined, g: CanvasRenderingContext2D, row = 0, across = 0, w = 0, h = 0, dpr = 1, top = 0
  const hurry = state(false)
  const rows = () => Math.floor((h - 8) / ROW)

  /** One finished row: a 2/2 twill, so the weft lies over two warps and under two, stepping one along each row. */
  function weave(r: number, y: number, c: ReturnType<typeof colours>) {
    const count = Math.ceil(w / PITCH)
    g.fillStyle = c.warp
    g.fillRect(0, y, w, ROW)
    g.fillStyle = [c.soft, c.ink, c.deep][band(r)]!
    for (let i = 0; i < count; i++) if ((i + r) & 2) g.fillRect(i * PITCH, y, PITCH - 0.5, ROW)
  }
  function warps(ctx: CanvasRenderingContext2D, c: ReturnType<typeof colours>) {
    ctx.fillStyle = c.warp
    for (let x = PITCH / 2; x < w; x += PITCH) ctx.fillRect(x - 0.5, 0, 1, h)
  }
  function rebuild(c: ReturnType<typeof colours>) {
    cloth ??= document.createElement('canvas')
    cloth.width = w * dpr
    cloth.height = h * dpr
    g = cloth.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    const n = rows()
    for (let i = 0; i < Math.min(row, n); i++) weave(row - 1 - i, (Math.min(row, n) - 1 - i) * ROW + 4, c)
  }
  const draw = ({ ctx, width, height, dpr: scale, dt, tier, still }: Frame) => {
    const c = colours(ctx.canvas)
    if (width !== w || height !== h || !cloth || scale !== dpr) {
      w = width; h = height; dpr = scale
      if (!row) { row = Math.floor(rows() * 0.8); across = 0.58 }
      rebuild(c)
    }
    if (!still) across += dt * (hurry.value ? 2.4 : 0.34 + tier.speed * 0.4)
    while (across >= 1) {
      across -= 1
      const n = rows()
      if (row >= n) { g.globalCompositeOperation = 'copy'; g.setTransform(1, 0, 0, 1, 0, -ROW * dpr); g.drawImage(cloth!, 0, 0); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.globalCompositeOperation = 'source-over' }
      weave(row, Math.min(row, n - 1) * ROW + 4, c)
      row++
    }
    ctx.clearRect(0, 0, w, h)
    warps(ctx, c)
    ctx.drawImage(cloth!, 0, 0, w, h)
    const n = rows(), y = Math.min(row, n - 1) * ROW + 4, right = row & 1, x = (right ? 1 - across : across) * w, from = right ? x : 0, to = right ? w : x
    // the row in progress, laid under the shuttle's tail
    ctx.fillStyle = [c.soft, c.ink, c.deep][band(row)]!
    for (let i = Math.floor(from / PITCH); i * PITCH < to; i++) if ((i + row) & 2) ctx.fillRect(i * PITCH, y, PITCH - 0.5, ROW)
    const tail = right ? x + 90 : x - 90, wash = ctx.createLinearGradient(tail, 0, x, 0)
    wash.addColorStop(0, 'transparent')
    wash.addColorStop(1, c.sweep)
    ctx.fillStyle = wash
    ctx.fillRect(Math.min(tail, x), y + 1, 90, 2)
    ctx.fillStyle = c.sweep
    ctx.fillRect(x - 11, y - 1, 22, 6)
  }
  return <Canvas draw={draw} animate={live} onTheme={() => { colours.reset(); cloth = undefined }} onPointerEnter={() => { hurry.value = true }} onPointerLeave={() => { hurry.value = false }} label="A shuttle weaving a striped twill, one row at a time" />
}
