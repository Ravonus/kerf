import { Dither, Segmented, type Algorithm } from '@weft/warp'
import { state } from 'weft'
import { fbm, clamp, mix, smooth, type ArtProps, type Meta } from './shared'
import code from './darkroom.tsx?raw'

export const meta: Meta = { name: 'Darkroom', description: 'One picture through every algorithm warp has. Drag the divider to see what the dither kept.', kind: 'field', code, wide: true, rest: true }

const ALGORITHMS = [{ value: 'atkinson', label: 'Atkinson' }, { value: 'floyd', label: 'Floyd' }, { value: 'bayer8', label: 'Bayer' }, { value: 'blue', label: 'Blue' }, { value: 'halftone', label: 'Halftone' }]
const CELLS = [{ value: '2', label: '2' }, { value: '3', label: '3' }, { value: '5', label: '5' }]

// There is no photograph in the repo, so the print is a dusk painted once here: sky, sun, three ridges, mist.
function dusk() {
  const W = 640, H = 300, c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!, px = g.createImageData(W, H), sky = [[0.98, 0.72, 0.5], [0.72, 0.42, 0.52], [0.16, 0.16, 0.34]]
  for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i += 4) {
    const v = y / H, u = x / W, up = clamp((0.72 - v) / 0.72), k = up * 2, a = sky[k < 1 ? 0 : 1], b = sky[k < 1 ? 1 : 2], m = k < 1 ? k : k - 1
    const cloud = smooth(0.52, 0.8, fbm(u * 5 + 3, v * 16, 5)) * 0.5
    let r = mix(a[0], b[0], m) + cloud * 0.25, gr = mix(a[1], b[1], m) + cloud * 0.16, bl = mix(a[2], b[2], m) + cloud * 0.12
    const d = Math.hypot((u - 0.66) * 2.13, v - 0.52), sun = smooth(0.1, 0.092, d), glow = Math.exp(-d * d * 7) * 0.6
    r += glow + sun; gr += glow * 0.7 + sun * 0.9; bl += glow * 0.35 + sun * 0.7
    for (let n = 0; n < 3; n++) {
      const top = 0.58 + n * 0.12 + (fbm(u * (3 + n * 1.5) + n * 7, n * 3.3, 5) - 0.5) * (0.42 - n * 0.06)
      if (v > top) { const haze = 0.42 - n * 0.2 + (v - top) * -0.1, s = 0.1 - n * 0.025; r = mix(s, 0.86, haze); gr = mix(s, 0.56, haze); bl = mix(s + 0.04, 0.55, haze) }
    }
    px.data[i] = r * 255; px.data[i + 1] = gr * 255; px.data[i + 2] = bl * 255; px.data[i + 3] = 255
  }
  g.putImageData(px, 0, 0)
  return c.toDataURL('image/png')
}

export default function Darkroom(_: ArtProps) {
  const split = state(52), algorithm = state('atkinson'), cell = state('3'), print = state<string | undefined>(typeof document === 'undefined' ? undefined : dusk())
  let host!: HTMLDivElement
  const slide = (e: PointerEvent) => {
    if (!e.buttons && e.type !== 'pointerdown') return
    if ((e.target as Element).closest('[data-art="controls"]')) return
    const r = host.getBoundingClientRect()
    split.value = clamp((e.clientX - r.left) / r.width, 0.02, 0.98) * 100
  }
  return (
    <div data-art="pierce" data-art-darkroom="" ref={host} style={`--split:${split.value}%`} onPointerDown={slide} onPointerMove={slide}>
      <img src={print.value} alt="" />
      <div data-part="print">{print.value && <Dither src={print.value} alt="A dusk over three ridges" algorithm={algorithm.value as Algorithm} cell={+cell.value} ramp="neutral" inks={4} fill />}</div>
      <i data-part="divider"></i>
      <div data-art="controls">
        <Segmented label="Algorithm" value={algorithm.value} onChange={(v: string) => { algorithm.value = v }} options={ALGORITHMS} />
        <Segmented label="Cell size" value={cell.value} onChange={(v: string) => { cell.value = v }} options={CELLS} />
      </div>
    </div>
  )
}
