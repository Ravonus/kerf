import { state } from '@weft-js/core'
import { group } from '@weft-js/core/style'
import { Card, Segmented, Stack, Switch } from '@weft-js/warp'

type Status = 'open' | 'shipped' | 'late'

// The look of one thing, in tokens: its variations are an axis, its pieces are parts.
const orderCard = group('learn-order-card', {
  base: {
    surface: 'raised',
    pad: 'group',
    radius: 'surface',
    layout: 'stack',
    gap: 'tight',
    border: 'tone',
  },
  axes: {
    status: { open: { tone: 'info' }, shipped: { tone: 'positive' }, late: { tone: 'critical' } },
  },
  parts: { title: { text: 'heading' }, meta: { text: 'caption', ink: 'tone' } },
  states: { selected: { ring: 'tone' } },
  defaults: { status: 'open' },
})

const STATUSES = [
  { value: 'open' as const, label: 'Open' },
  { value: 'shipped' as const, label: 'Shipped' },
  { value: 'late' as const, label: 'Late' },
]

export default function Order() {
  const status = state<Status>('open')
  const selected = state(false)
  return (
    <Card title="An order card">
      <Stack gap="related">
        <Segmented
          label="Status"
          value={status.value}
          options={STATUSES}
          onChange={(next) => (status.value = next)}
        />
        <Switch
          checked={selected.value}
          onChange={(e: Event & { currentTarget: HTMLInputElement }) =>
            (selected.value = e.currentTarget.checked)
          }
        >
          Selected
        </Switch>
        <article {...orderCard({ status: status.value, selected: selected.value })}>
          <p {...orderCard.title}>Order #1042</p>
          <p {...orderCard.meta}>2 bags of coffee · {status.value}</p>
        </article>
      </Stack>
    </Card>
  )
}
