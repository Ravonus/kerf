import { Canvas, type CanvasFrame as Frame } from '@weft-js/warp'
import { palette, quantize, tile } from '@weft-js/warp-core/dither'
import { type ArtProps, type Meta } from './shared'
import code from './plasma-ink.tsx?raw'

export const meta: Meta = { name: 'Plasma Ink', description: 'Four sines added together, the oldest trick in the demoscene, printed in four inks through an ordered screen. The pointer shifts the phase.', kind: 'shader', code }

const SIZE = 1024, WAVE = Float32Array.from({ length: SIZE }, (_, i) => Math.sin((i / SIZE) * Math.PI * 2)), sine = (v: number) => WAVE[(v * (SIZE / (Math.PI * 2))) & (SIZE - 1)]!
const SCREEN = tile('bayer8')

export default function PlasmaInk({ live = true }: ArtProps) {
  let tones = new Float32Array(0), out = new Uint32Array(0), image: ImageData | undefined, cells: Uint32Array | undefined, shift = 0
  const draw = ({ ctx, width, height, time, tier, pointer, dt }: Frame) => {
    cells ??= palette(ctx.canvas.parentElement!, ['--warp-color-page', '--warp-color-accent-soft', '--warp-color-accent-border', '--warp-color-accent-solid', '--warp-color-text'])
    if (!image || image.width !== width || image.height !== height) {
      image = new ImageData(width, height)
      out = new Uint32Array(image.data.buffer)
      tones = new Float32Array(width * height)
    }
    if (pointer.in) shift += ((pointer.x / width - 0.5) * 6 - shift) * Math.min(1, dt * 3)
    const t = 11 + time * (0.2 + tier.speed * 0.5), k = 96 / height, cx = width * (0.5 + 0.3 * Math.sin(t * 0.3)), cy = height * (0.5 + 0.3 * Math.cos(t * 0.23))
    for (let y = 0, i = 0; y < height; y++) {
      const v = y * k, b = sine(v * 0.13 - t * 0.7 + 200), dy = y - cy
      for (let x = 0; x < width; x++, i++) {
        const u = x * k, dx = x - cx
        const sum = sine(u * 0.11 + t + shift + 200) + b + sine((u + v) * 0.08 + t * 0.5 + 200) + sine(Math.sqrt(dx * dx + dy * dy) * k * 0.15 - t + 200)
        tones[i] = sum * 0.125 + 0.5
      }
    }
    if (quantize(tones, width, height, SCREEN, cells, out)) ctx.putImageData(image, 0, 0)
  }
  return <Canvas draw={draw} animate={live} cell={3} pointer onTheme={() => { cells = undefined; image = undefined }} label="An interference plasma in four dithered inks" />
}
