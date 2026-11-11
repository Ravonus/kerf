import { derived, state } from '@kerf-js/core'
import { render } from '@kerf-js/core/dom'

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
