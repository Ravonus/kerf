import { render } from '@kerf/core/dom'
import { defineSurface, Surface } from '@kerf/core/surface'

const Clear = defineSurface({
  name: 'clear',
  kind: 'webgl2',
  setup(s) {
    s.frame((t) => {
      s.gl.clearColor(0, 0, Math.sin(t.seconds), 1)
      s.gl.clear(s.gl.COLOR_BUFFER_BIT)
    })
  },
})
render(() => <Surface use={Clear} aspect="16/9" label="Clear" />, document.body)
