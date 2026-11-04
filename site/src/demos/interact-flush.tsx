import { flush, state } from '@weft-js/core'
import { Button, Card } from '@weft-js/warp'

export default function Flush() {
  const count = state(0)
  const report = state('Press the button.')
  let shown: HTMLElement | undefined
  const add = () => {
    count.value++
    const before = shown?.textContent
    // The DOM update is queued until the handler ends.
    // flush() applies it now.
    flush()
    const after = shown?.textContent
    report.value =
      `count.value was ${count.value} at once. ` +
      `The page said ${before}, then ${after} ` +
      'after flush().'
  }
  return (
    <Card title="When the page catches up">
      <p>
        Count:{' '}
        <strong ref={(el: HTMLElement) => (shown = el)}>
          {count.value}
        </strong>
      </p>
      <Button size="sm" onClick={add}>
        Add one
      </Button>
      <p>{report.value}</p>
    </Card>
  )
}
