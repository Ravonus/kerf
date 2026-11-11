import { derived, state } from '@kerf/core'
import { render } from '@kerf/core/dom'

function Counter() {
  const count = state(0)
  const double = derived(() => count.value * 2)
  return (
    <button onClick={() => count.value++}>
      {count.value} × 2 = {double.value}
    </button>
  )
}

render(() => <Counter />, document.getElementById('root')!)
