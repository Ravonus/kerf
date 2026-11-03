import { state, untrack, watch, type Derived } from '@weft-js/core'
import { Card, Input } from '@weft-js/warp'

/** `source`'s value once it has stopped changing for `ms`. Call it while a component is being set up. */
function debounced<T>(source: () => T, ms: number): Derived<T> {
  const settled = state(untrack(source))
  watch(source, value => {
    const timer = setTimeout(() => (settled.value = value), ms)
    return () => clearTimeout(timer)
  })
  return settled
}

export default function Search() {
  const typed = state('')
  const query = debounced(() => typed.value.trim(), 400)
  return (
    <Card title="A debounced value">
      <Input label="Search" value={typed.value} onInput={e => (typed.value = e.currentTarget.value)} />
      <p>Typed: “{typed.value}”</p>
      <p>Searching for: “{query.value}”</p>
    </Card>
  )
}
