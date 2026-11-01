// Research 40: Ana and Ben, two panes, one row per person. `?rows=40` adds rows; `?unshared` is plain boxes.
import { derived, state, untrack, watch } from 'weft'
import { interaction, type Interaction } from 'weft/interaction'
import { shareStats } from '../../../../../src/share'
import '../../../../../../warp/src/ui'
import { Button } from '../../../../../../warp/src/Button'
import { Checkbox } from '../../../../../../warp/src/Choice'
import './ui-state.css'

const query = () => (typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search))
if (typeof window !== 'undefined') (window as any).__share = shareStats

const nameOf = (i: number) => ['Ana', 'Ben', 'Secret'][i] ?? `Row ${i}`
const keyOf = (name: string) => (name === 'Secret' ? 'secret:row' : `person:${name.toLowerCase()}`)

function Person(props: { ui: Interaction; name: string; pane: string }) {
  const status = derived(() => (props.ui.hover.value ? 'hovering here' : props.ui.remote.value.hover ? `${props.ui.remote.value.hover} elsewhere` : 'idle'))
  return (
    <li class="person" data-testid={`${props.pane}-${props.name}`}>
      <Checkbox ui={props.ui}>{props.name}</Checkbox>
      <Button ui={props.ui} emphasis="soft" size="sm">Open</Button>
      <output aria-label={`${props.pane} ${props.name} state`}>{status.value}</output>
    </li>
  )
}

function Row(props: { i: number; panes: string[] }) {
  const name = untrack(() => nameOf(props.i))
  const ui = query().has('unshared') ? interaction() : interaction({ share: () => keyOf(name) })
  // Local hover logic: the thing a remote hover must never run.
  watch(() => ui.hover.value, on => { if (on && typeof window !== 'undefined') (window as any).__localHover = ((window as any).__localHover ?? 0) + 1 })
  return <>{props.panes.map(pane => <Person ui={ui} name={nameOf(props.i)} pane={pane} />)}</>
}

export default function UiState() {
  const count = +(query().get('rows') ?? 3)
  const rows = Array.from({ length: count }, (_, i) => i)
  const shown = state(true)
  return (
    <main class="ui-state">
      <section aria-label="left"><h2>Left pane</h2><ul>{rows.map(i => <Row i={i} panes={['left']} />)}</ul></section>
      <section aria-label="right"><h2>Right pane</h2><ul>{rows.map(i => <Row i={i} panes={['right']} />)}</ul></section>
      <section aria-label="removable">
        {shown.value && <ul><Row i={7} panes={['gone']} /></ul>}
        <button aria-label="remove row" onClick={() => { shown.value = false }}>remove</button>
      </section>
    </main>
  )
}
