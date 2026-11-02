import { derived } from '@weft-js/core'
import { interaction } from '@weft-js/core/interaction'
import { Card, Checkbox } from '@weft-js/warp'

function Row(props: { id: string; text: string }) {
  // Drop `share` and it is plain hover state for one row.
  const row = interaction({ share: () => `demo:${props.id}` })
  const note = derived(() => {
    if (row.hover.value) return 'here'
    const others = row.remote.value.hover
    return others ? `${others} elsewhere` : ''
  })
  return (
    <Checkbox ui={row} hint={note.value}>
      {props.text}
    </Checkbox>
  )
}

export default function UiState() {
  return (
    <div data-part="panes">
      {['Ana', 'Ben'].map(who => (
        <Card key={who} title={who}>
          <Row id="flights" text="Book flights" />
          <Row id="pack" text="Pack" />
        </Card>
      ))}
    </div>
  )
}
