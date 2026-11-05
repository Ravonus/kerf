import { state } from '@weft-js/core'
import {
  defineSurface,
  Surface,
} from '@weft-js/core/surface'
import { Card, Slider } from '@weft-js/warp'

// A canvas in layout. `setup` runs once;
// `props.height` is read live on every frame.
const Wave = defineSurface<
  { height: number },
  'canvas2d'
>({
  name: 'wave',
  kind: 'canvas2d',
  setup(s, props) {
    s.frame(({ seconds }) => {
      const { width, height } = s.size.value
      s.ctx.strokeStyle =
        s.tokens.accent?.css ?? 'currentColor'
      s.ctx.lineWidth = 2
      s.ctx.beginPath()
      for (let x = 0; x <= width; x += 4) {
        const y =
          height / 2 +
          Math.sin(x / 30 + seconds * 2) * props.height
        if (x === 0) s.ctx.moveTo(x, y)
        else s.ctx.lineTo(x, y)
      }
      s.ctx.stroke()
    })
  },
})

export default function Waves() {
  const height = state(20)
  return (
    <Card title="A surface">
      <Slider
        label="Wave height"
        min={0}
        max={60}
        value={height.value}
        onChange={(v) => (height.value = v)}
      />
      <Surface
        use={Wave}
        height={height.value}
        aspect="4/1"
        label="A sine wave that moves to the right"
      />
    </Card>
  )
}
