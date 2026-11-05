import {
  defineState,
  derived,
  state,
  type State,
} from '@weft-js/core'
import { interaction } from '@weft-js/core/interaction'
import { Card, Checkbox } from '@weft-js/warp'

// What's ticked is data: one box each, read by both
// panes, and with sync: 'tabs' by every tab.
const trip = defineState('demo-trip', () => ({
  flights: state(false, {
    persist: 'local',
    sync: 'tabs',
  }),
  pack: state(false, { persist: 'local', sync: 'tabs' }),
}))

function Row({ id, text, done }: {
  id: string
  text: string
  done: State<boolean>
}) {
  // Hover, focus and press are UI state: one key is
  // one row, here, in other tabs and on other
  // clients.
  const row = interaction({
    share: () => `demo:${id}`,
  })
  const note = derived(() => {
    if (row.hover.value) return 'here'
    const { hover, pressed } = row.remote.value
    if (pressed) return 'pressed elsewhere'
    return hover ? `${hover} elsewhere` : ''
  })
  return (
    <Checkbox
      ui={row}
      hint={note.value}
      checked={done.value}
      onChange={() => {
        done.value = !done.value
      }}
    >
      {text}
    </Checkbox>
  )
}

export default function UiState() {
  return (
    <div data-part="panes">
      {['Ana', 'Ben'].map((who) => (
        <Card key={who} title={who}>
          <Row
            id="flights"
            text="Book flights"
            done={trip.flights}
          />
          <Row
            id="pack"
            text="Pack"
            done={trip.pack}
          />
        </Card>
      ))}
    </div>
  )
}
