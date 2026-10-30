// `defineState` through a render and hydration (test/ssr-state.test.tsx): cookie, local and render-written boxes.
import { untrack } from 'weft'
import { prefs } from './Prefs.state'

export function Prefs(props: { label?: string }) {
  untrack(() => { if (props.label) prefs.label.value = props.label })
  return (
    <p class="prefs" data-theme={prefs.theme.value}>
      <b>{prefs.cart.value.n}</b> <i>{prefs.label.value}</i>
    </p>
  )
}

export function Note() {
  return <p class="note">{prefs.note.value}</p>
}
