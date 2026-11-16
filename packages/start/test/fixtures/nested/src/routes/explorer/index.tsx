import { Boundary, resource, state } from '@kerf-js/core'

function Panel() {
  const rows = resource(
    () =>
      new Promise<string>((ok) => {
        setTimeout(() => ok('rows'), 50)
      }),
  )
  const n = state(0)
  return (
    <button class="panel" onClick={() => void n.value++}>
      Network {rows.value} {n.value}
    </button>
  )
}

/** A page that is one island at its top: a static level whose only nodes are the island's, which it replaces. */
export default function Network() {
  return (
    <Boundary pending={<p class="waiting">Loading</p>}>
      <Panel />
    </Boundary>
  )
}
