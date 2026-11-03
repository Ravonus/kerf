import { Canvas, type CanvasFrame as Frame } from '@weft-js/warp'
import { palette, quantize, rasterMask, tile, type Mask } from '@weft-js/warp-core/dither'
import { smooth, noise, type ArtProps, type Meta } from './shared'
import code from './bad-signal.tsx?raw'

export const meta: Meta = { name: 'Bad Signal', description: 'A word on a failing tube. The rows tear in bursts and the rest barely holds. Good for a 404. Hover and it steadies.', kind: 'shader', code }

const SCREEN = tile('bayer4')

export default function BadSignal({ live = true }: ArtProps) {
  let tones = new Float32Array(0), out = new Uint32Array(0), image: ImageData | undefined, cells: Uint32Array | undefined, torn: number, mask: Mask | undefined, calm = 0
  const draw = ({ ctx, width, height, time, dt, pointer, still }: Frame) => {
    const host = ctx.canvas.parentElement!
    if (!cells) { cells = palette(host, ['none', '--warp-color-border-strong', '--warp-color-text-subtle', '--warp-color-text']); torn = palette(host, ['--warp-color-critical-text'])[0]! }
    if (!image || image.width !== width || image.height !== height) {
      image = new ImageData(width, height)
      out = new Uint32Array(image.data.buffer)
      tones = new Float32Array(width * height)
      mask = rasterMask({ text: '404', weight: 600, fit: 0.72 }, width, height, getComputedStyle(host).fontFamily || 'sans-serif')
    }
    calm += ((pointer.in ? 1 : 0) - calm) * Math.min(1, dt * 6)
    const t = still ? 3.4 : time, wild = 1 - calm, shape = mask!.shape, halo = mask!.halo, burst = smooth(0.62, 0.8, noise(t * 1.4, 4)) * wild, roll = (t * 12) % height
    for (let y = 0, i = 0; y < height; y++) {
      const band = noise(y * 0.09, t * 3) - 0.5, jag = noise(y * 0.7, t * 13) - 0.5
      const off = Math.round((band * 34 * burst + jag * (6 + 22 * burst)) * wild + Math.sin(y * 0.18 + t * 2) * 1.4 * wild), scan = y & 1 ? 0.8 : 1
      const glow = 1 - Math.abs(((y - roll + height) % height) / height - 0.5) * 0.5
      for (let x = 0; x < width; x++, i++) {
        const sx = x - off, at = sx < 0 || sx >= width ? -1 : y * width + sx
        const s = at < 0 ? 0 : shape[at]!, h = at < 0 ? 0 : halo[at]!
        tones[i] = (s * 0.96 + h * 0.14) * scan * glow
      }
    }
    quantize(tones, width, height, SCREEN, cells, out)
    if (burst > 0.2) for (let y = 0; y < height; y++) if (noise(y * 0.3, t * 9) > 0.66) for (let x = 0, i = y * width; x < width; x++, i++) if (out[i]) out[i] = torn
    ctx.putImageData(image, 0, 0)
  }
  return <Canvas draw={draw} animate={live} cell={3} fps={24} pointer onTheme={() => { cells = undefined; image = undefined }} label="The number 404 on a failing screen" />
}
