import { onCleanup, onMount, state } from '@kerf-js/core'
import { Card, Slider } from '@kerf-js/veneer'

export default function Ruler() {
  const percent = state(60)
  const px = state(0)
  let bar: HTMLElement | undefined
  // The element exists once the component is in the
  // page, so measuring starts there.
  onMount(() => {
    if (!bar) return
    const seen = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (box) px.value = Math.round(box.width)
    })
    seen.observe(bar)
    onCleanup(() => seen.disconnect())
  })
  return (
    <Card title="Measure an element">
      <Slider
        label="Width"
        min={10}
        max={100}
        value={percent.value}
        onChange={(v) => (percent.value = v)}
        format={(v) => `${v}%`}
      />
      <div
        ref={(el: HTMLElement) => (bar = el)}
        style={
          `inline-size:${percent.value}%;` +
          'block-size:0.75rem;' +
          'background:var(--veneer-color-accent-solid)'
        }
      ></div>
      <p>
        The bar is {px.value} px wide. Resize the window
        too.
      </p>
    </Card>
  )
}
