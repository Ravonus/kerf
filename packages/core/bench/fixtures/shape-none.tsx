// shape.tsx with a hand-written pending and an exported component: its variant must tree-shake away.
import { Boundary, resource, state } from '@kerf/core'
import { render } from '@kerf/core/dom'

const load = () => fetch('/x').then((r) => r.json() as Promise<{ id: number; name: string }[]>)

export function List() {
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
    <Boundary pending={<p>Loading</p>}>
      <List />
    </Boundary>
  ),
  document.body,
)
