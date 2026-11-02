// What test/e2e.mjs drives in a real browser: both built-in backends, the mirror, a box on the outside.
import { state } from '@weft-js/core'
import { clock, defineSurface, Surface } from '@weft-js/core/surface'

export const lab = { level: state(20), title: state('A surface title long enough to wrap onto a second line of the canvas'), paints: 0, setups: 0, frames: 0, frame: 0, body: 0, gl: null as unknown, heading: null as unknown, scripts: null as unknown, other: state('مرحبا بالعالم 春天到了 中文排版') }

export const Bars = defineSurface<{ level: number; title: string; other: string }, 'canvas2d'>({
  name: 'bars',
  kind: 'canvas2d',
  setup(s, props) {
    lab.heading = s.text(() => props.title, { x: 10, y: 10, width: 220, font: '16px Arial', lineHeight: 24 })
    lab.scripts = s.text(() => props.other, { x: 10, y: 120, width: 220, font: '16px Arial', lineHeight: 24 })
    s.draw(() => {
      lab.paints++
      s.ctx.fillStyle = s.tokens.accent!.css
      s.ctx.fillRect(10, s.size.value.height - 20, props.level, 10)
    })
  },
})

export const Tint = defineSurface<{ level: number }, 'webgl2'>({
  name: 'tint',
  kind: 'webgl2',
  fps: 60,
  context: { preserveDrawingBuffer: true },
  setup(s, props) {
    lab.setups++
    lab.gl = s.gl
    const label = s.text('WebGL label', { x: 4, y: 4, width: 120, color: 'white' })
    label.el.id = 'gl-label'
    s.frame(t => {
      lab.frames++
      lab.frame = t.frame
      const [r, g, b] = s.tokens.accent!.linear
      s.gl.clearColor(r, g, b * (props.level / 100), 1)
      s.gl.clear(s.gl.COLOR_BUFFER_BIT)
    })
  },
})

export function Lab() {
  lab.body++
  return (
    <main style="width:320px">
      <Surface use={Bars} level={lab.level.value} title={lab.title.value} other={lab.other.value} aspect="4/3" label="Bars" />
      <Surface use={Tint} level={lab.level.value} aspect="2/1" label="Tint" />
    </main>
  )
}

export { clock }
