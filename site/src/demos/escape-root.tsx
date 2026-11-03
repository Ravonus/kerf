import { createRoot, onCleanup, state } from '@weft-js/core'
import { interval } from '@weft-js/core/browser'
import { Button, Card, Row } from '@weft-js/warp'

export default function Session() {
  const seconds = state(0)
  const running = state(false)
  let stop: (() => void) | undefined

  // A click has no owner, so it makes one: the root owns the interval until `stop` ends it.
  const start = () => {
    if (stop) return
    createRoot(dispose => {
      stop = dispose
      interval('1s', () => seconds.value++)
    })
    running.value = true
  }
  const end = () => {
    stop?.()
    stop = undefined
    running.value = false
  }
  // A root outlives the code that made it, so the component ends it on its way out.
  onCleanup(end)

  return (
    <Card title="An owner made by hand">
      <p>Session: {seconds.value} s {running.value ? '(running)' : '(stopped)'}</p>
      <Row gap="tight">
        <Button size="sm" disabled={running.value} onClick={start}>Start</Button>
        <Button size="sm" emphasis="outline" disabled={!running.value} onClick={end}>Stop</Button>
      </Row>
    </Card>
  )
}
