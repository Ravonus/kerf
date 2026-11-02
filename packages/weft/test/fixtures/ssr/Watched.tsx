// A component that creates extra reactive work on the client only (a watcher, memos), before and between holes.
// With keys from the owner tree these shifted every key after them; with source-path keys they can't.
import { derived, state, untrack, watch } from '@weft-js/core'

export function Watched(props: { client: boolean }) {
  const items = state(['a', 'b'])
  const client = untrack(() => props.client) // fixed per side
  if (client) watch(() => items.value.length, () => {})
  const label = client ? derived(() => `${items.value.length} items`) : { value: untrack(() => `${items.value.length} items`) }
  return (
    <div>
      <h2>{label.value}</h2>
      {client && derived(() => null).value}
      <ul>{items.value.map(i => <li key={i}>{i}</li>)}</ul>
    </div>
  )
}
