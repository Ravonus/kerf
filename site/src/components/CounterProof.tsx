import { onMount, state } from '@kerf/core'
import { stats } from '@kerf/core/internal'
import { Button } from '@kerf/veneer'

/** The hero's claim, live: press it and the counts come from this page's own MutationObserver and Kerf's own counter. */
export function CounterProof() {
  const count = state(0)
  const writes = state(0)
  const runs = state(0)
  let shown: HTMLElement | undefined
  let base = 0
  onMount(() => {
    base = stats.runs
    const seen = new MutationObserver((r) => {
      writes.value += r.length
      runs.value = stats.runs - base
    })
    seen.observe(shown!, { subtree: true, childList: true, characterData: true })
    return () => seen.disconnect()
  })
  return (
    <div data-site="proof">
      <div data-part="counter">
        <Button size="lg" onClick={() => count.value++}>
          <span ref={(el) => (shown = el)}>{count.value}</span>
        </Button>
        <dl>
          <div>
            <dt>Component runs</dt>
            <dd>1</dd>
          </div>
          <div>
            <dt>Reactive runs</dt>
            <dd>{runs.value}</dd>
          </div>
          <div>
            <dt>DOM writes</dt>
            <dd>{writes.value}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
