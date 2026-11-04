import { Boundary, resource, state } from '@weft-js/core'
import { render } from '@weft-js/core/dom'

const load = () => fetch('/x').then((r) => r.json() as Promise<{ id: number; name: string }[]>)

function List() {
  const rows = resource(load)
  const pick = state(0)
  return (
    <ul onClick={() => pick.value++}>
      {(rows.value ?? []).map((r) => (
        <li key={r.id}>
          <b>{r.name}</b>
        </li>
      ))}
    </ul>
  )
}

render(
  () => (
    <Boundary pending="shape">
      <List />
    </Boundary>
  ),
  document.body,
)
