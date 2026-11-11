import { Canvas, type CanvasFrame as Frame } from '@kerf/veneer'
import { onCleanup, onMount } from '@kerf/core'
import { inks, smooth, type ArtProps, type Meta } from './shared'
import code from './bobbin.tsx?raw'

export const meta: Meta = {
  name: 'Bobbin',
  description:
    'Every dot sits 137.5° past the last, the angle sunflowers use, and the disc breathes. Scroll and it turns with you.',
  kind: 'generative',
  code,
}

const COUNT = 1700,
  GOLDEN = (137.508 * Math.PI) / 180
const colours = inks({
  near: '--veneer-color-text',
  mid: '--veneer-color-accent-text',
  far: '--veneer-color-accent-border',
})

export default function Bobbin({ live = true }: ArtProps) {
  let scroll = 0
  onMount(() => {
    const on = () => {
      scroll = scrollY
    }
    addEventListener('scroll', on, { passive: true })
    onCleanup(() => removeEventListener('scroll', on))
  })
  const draw = ({ ctx, width, height, time, tier }: Frame) => {
    const c = colours(ctx.canvas),
      cx = width / 2,
      cy = height / 2,
      unit = (Math.min(width, height) * 0.49) / Math.sqrt(COUNT),
      t = 4 + time * (0.25 + tier.speed * 0.35) + scroll * 0.0025
    ctx.clearRect(0, 0, width, height)
    for (let band = 0; band < 3; band++) {
      ctx.fillStyle = [c.far, c.mid, c.near][band]!
      ctx.beginPath()
      for (let n = band; n < COUNT; n += 3) {
        const a = n * GOLDEN + t * 0.06,
          r = unit * Math.sqrt(n),
          wave = Math.sin(n * 0.02 + t) * 0.5 + 0.5,
          breathe = Math.sin(Math.sqrt(n) * 0.55 - t * 1.3) * 0.5 + 0.5
        const size = 0.5 + (wave * 0.4 + breathe * 0.6) ** 1.8 * unit * 0.6 * smooth(0, 90, n + 18)
        const x = cx + Math.cos(a) * r,
          y = cy + Math.sin(a) * r
        ctx.moveTo(x + size, y)
        ctx.arc(x, y, size, 0, 6.2832)
      }
      ctx.fill()
    }
  }
  return (
    <Canvas
      draw={draw}
      animate={live}
      onTheme={colours.reset}
      label="A phyllotaxis disc of dots that swells and settles"
    />
  )
}
