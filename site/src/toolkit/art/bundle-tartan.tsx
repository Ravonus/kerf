import { Canvas, type CanvasFrame as Frame } from '@weft/warp'
import { palette } from '@weft/warp-core/dither'
import { state } from 'weft'
import { type ArtProps, type Meta } from './shared'
import code from './bundle-tartan.tsx?raw'

export const meta: Meta = { name: 'Bundle Tartan', description: 'warp\'s fourteen largest components, gzipped, set as a tartan: a stripe as wide as its bytes, crossed with itself. Hover to name a stripe.', kind: 'data', code, wide: true, rest: true }

// gzip -c of each source file, 2026-11-01
const MODULES: [string, number][] = [['DataGrid', 9516], ['Table', 8949], ['VirtualList', 5702], ['Shell', 5557], ['CommandPalette', 5504], ['RichSelect', 5118], ['RichTextEditor', 4521], ['TimeField', 4283], ['DateField', 3821], ['MonthPicker', 3629], ['Calendar', 3461], ['ScrollGrid', 3254], ['Chart', 2943], ['RecurrenceField', 2924]]
const total = MODULES.reduce((n, m) => n + m[1], 0), SETT_INKS = ['--warp-color-text', '--warp-color-accent-solid', '--warp-color-accent-soft', '--warp-color-caution-solid', '--warp-color-text-subtle', '--warp-color-page']
/** A sett reflects at each end, as a real tartan's does. */
const SETT = [...MODULES.keys(), ...[...MODULES.keys()].reverse()]

export default function BundleTartan(_: ArtProps) {
  const found = state('')
  let inksNow: Uint32Array | undefined, map = new Int16Array(0), image: ImageData | undefined, out = new Uint32Array(0)
  function lay(cols: number) {
    map = new Int16Array(cols)
    let x = 0
    for (let turn = 0; x < cols; turn++) for (const m of SETT) {
      const wide = Math.max(2, Math.round((MODULES[m]![1] / total) * 150))
      for (let i = 0; i < wide && x < cols; i++, x++) map[x] = m
    }
  }
  const draw = ({ ctx, width, height, pointer }: Frame) => {
    inksNow ??= palette(ctx.canvas.parentElement!, SETT_INKS)
    if (!image || image.width !== width || image.height !== height) {
      image = new ImageData(width, height)
      out = new Uint32Array(image.data.buffer)
      lay(Math.max(width, height))
      // 2/2 twill: warp and weft take turns on a diagonal, which is why tartan's crossings read as a third colour
      for (let y = 0, i = 0; y < height; y++) for (let x = 0; x < width; x++, i++) out[i] = inksNow[((x + y) & 3) < 2 ? map[x]! % SETT_INKS.length : map[y]! % SETT_INKS.length]!
    }
    ctx.putImageData(image, 0, 0)
    const over = pointer.in ? map[Math.min(width - 1, Math.floor(pointer.x))]! : -1
    if (over >= 0) {
      found.value = `${MODULES[over]![0]}: ${(MODULES[over]![1] / 1000).toFixed(1)} kB`
      ctx.fillStyle = 'rgb(255 255 255 / 0.55)'
      for (let x = 0; x < width; x++) if (map[x] !== over) ctx.fillRect(x, 0, 1, height)
    } else found.value = ''
  }
  return (
    <>
      <Canvas draw={draw} cell={2} pointer onTheme={() => { inksNow = undefined; image = undefined }} label={`A tartan of warp's fourteen largest components, ${(total / 1000).toFixed(0)} kB gzipped`} />
      <p data-art="readout">{found.value}</p>
      <table data-art="table">
        <caption>Gzipped size of warp's largest components</caption>
        <thead><tr><th scope="col">Component</th><th scope="col">Bytes</th></tr></thead>
        <tbody>{MODULES.map(([name, bytes]) => <tr key={name}><th scope="row">{name}</th><td>{bytes}</td></tr>)}</tbody>
      </table>
    </>
  )
}
