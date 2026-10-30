import { state } from 'weft'
import { render } from 'weft/dom'
import { defineSurface, Surface } from 'weft/surface'

const level = state(1)
const Bars = defineSurface<{ level: number }>({ name: 'bars', kind: 'canvas2d', setup(s, props) { s.draw(() => s.ctx.fillRect(0, 0, props.level, 10)) } })
render(() => <Surface use={Bars} level={level.value} label="Bars" />, document.body)
