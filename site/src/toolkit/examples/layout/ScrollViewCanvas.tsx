import { ScrollView } from '@kerf/veneer'
import { canvas } from '@kerf/scroll/canvas'

const lines = Array.from({ length: 80 }, (_, i) => i)

// The default paint, then a notch at the middle of
// the thumb, drawn on the bar's own canvas.
const notched = canvas({
  draw(ctx, frame, paint) {
    paint(ctx, frame)
    const { x, y, width, height } = frame.thumb
    ctx.fillStyle = 'rgb(255 255 255 / 0.85)'
    ctx.fillRect(x, y + height / 2 - 1, width, 2)
  },
})

export const ScrollViewCanvas = () => (
  <ScrollView
    label="Lines"
    axes="y"
    renderer={notched}
    bar={{ width: 8, hoverWidth: 12 }}
    style="height:220px"
  >
    {lines.map((n) => (
      <p style="margin:0;padding:6px 12px">Line {n}</p>
    ))}
  </ScrollView>
)
