import { state } from '@kerf/core'
import { render } from '@kerf/core/dom'
import { defineSurface, Surface } from '@kerf/core/surface'

const level = state(1)
const Bars = defineSurface<{ level: number }>({
  name: 'bars',
  kind: 'canvas2d',
  setup(s, props) {
    s.draw(() => s.ctx.fillRect(0, 0, props.level, 10))
  },
})
render(() => <Surface use={Bars} level={level.value} label="Bars" />, document.body)
