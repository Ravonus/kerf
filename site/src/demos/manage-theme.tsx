import { context, state, type State } from '@kerf-js/core'
import { Button, Card, Row, Switch } from '@kerf-js/veneer'

// A box, so a change reaches every reader. The
// fallback serves anything outside a provider.
const Armed = context<State<boolean>>(state(false))

function DeleteButton() {
  const armed = Armed.use
  return (
    <Button
      tone={armed.value ? 'critical' : 'neutral'}
      disabled={!armed.value}
    >
      Delete everything
    </Button>
  )
}

// A middle layer that passes nothing down.
function Actions() {
  return (
    <Row gap="tight">
      <Button emphasis="outline">Export</Button>
      <DeleteButton />
    </Row>
  )
}

export default function DangerZone() {
  const armed = state(false)
  return Armed.provide(armed, () => (
    <Card title="Danger zone">
      <Switch
        checked={armed.value}
        onChange={(
          e: Event & { currentTarget: HTMLInputElement },
        ) => (armed.value = e.currentTarget.checked)}
      >
        Allow deleting
      </Switch>
      <Actions />
    </Card>
  ))
}
