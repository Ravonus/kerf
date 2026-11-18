import { state } from '@kerf-js/core'

function Counter() {
  const count = state(0)
  return <button onClick={() => count.value++}>{count.value}</button>
}

export function Panel() {
  return (
    <aside>
      <h2>Linked island</h2>
      <Counter />
    </aside>
  )
}
