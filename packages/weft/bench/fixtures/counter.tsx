import { derived, state } from 'weft'
import { render } from 'weft/dom'

function Counter() {
  const count = state(0)
  const double = derived(() => count.value * 2)
  return <button onClick={() => count.value++}>{count.value} × 2 = {double.value}</button>
}

render(() => <Counter />, document.getElementById('root')!)
