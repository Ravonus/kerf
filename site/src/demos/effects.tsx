import { state, watch } from '@weft-js/core'
import { Button, Card } from '@weft-js/warp'

export default function Stopwatch() {
  const running = state(false)
  const tenths = state(0)
  let lap!: HTMLInputElement

  // Runs when `running` changes. The function it returns cleans up before the next run, and when the component goes.
  watch(() => running.value, on => {
    if (!on) return
    const id = setInterval(() => tenths.value++, 100)
    return () => clearInterval(id)
  })

  return (
    <Card title="Stopwatch">
      <p><strong>{(tenths.value / 10).toFixed(1)} s</strong></p>
      <Button onClick={() => (running.value = !running.value)}>{running.value ? 'Stop' : 'Start'}</Button>
      <input ref={lap} aria-label="Lap" readOnly value={`Lap at ${(tenths.value / 10).toFixed(1)} s`} />
      <Button emphasis="ghost" tone="neutral" onClick={() => lap.select()}>Select the lap</Button>
    </Card>
  )
}
