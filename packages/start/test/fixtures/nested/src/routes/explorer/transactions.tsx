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
      Transactions {rows.value} {n.value}
    </button>
  )
}

/** The same shape as the page beside it: moving between them changes only the level under the layout. */
export default function Transactions() {
  return (
    <Boundary pending={<p class="waiting">Loading</p>}>
      <Panel />
    </Boundary>
  )
}
