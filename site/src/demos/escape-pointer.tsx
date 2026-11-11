import { state } from '@kerf/core'
import { on } from '@kerf/core/browser'
import { Card } from '@kerf/veneer'

/** Pointer position over `el()` as a box. The listener
 * leaves with the caller's owner. */
function pointer(el: () => HTMLElement | undefined) {
  const at = state({ x: 0, y: 0, inside: false })
  // The server has no window. on() would do nothing
  // there, but its argument still has to exist.
  if (typeof window !== 'undefined')
    on(window, 'pointermove', (e) => {
      const box = el()?.getBoundingClientRect()
      if (!box) return
      const x = Math.round(e.clientX - box.left),
        y = Math.round(e.clientY - box.top)
      at.value = {
        x,
        y,
        inside:
          x >= 0 &&
          y >= 0 &&
          x <= box.width &&
          y <= box.height,
      }
    })
  return at
}

export default function Tracker() {
  let pad: HTMLElement | undefined
  const where = pointer(() => pad)
  return (
    <Card title="One function, any component">
      <div
        ref={(el: HTMLElement) => (pad = el)}
        style={
          'block-size:6rem;' +
          'border:1px dashed var(--veneer-color-border);' +
          'border-radius:var(--veneer-radius-control)'
        }
      >
        <p>
          {where.value.inside
            ? `${where.value.x}, ${where.value.y}`
            : 'Move the pointer in here'}
        </p>
      </div>
    </Card>
  )
}
