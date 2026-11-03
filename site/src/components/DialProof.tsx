import { Badge, Button, Input, Segmented, Switch } from '@weft-js/warp'
import { state } from '@weft-js/core'

type Stop = 'quiet' | 'balanced' | 'vivid'

export function DialProof() {
  const stop = state<Stop>('balanced')
  return (
    <div data-site="dial-panel" data-expression={stop.value}>
      <Segmented label="Expression" value={stop.value} onChange={v => (stop.value = v)} options={[{ value: 'quiet', label: 'Quiet' }, { value: 'balanced', label: 'Balanced' }, { value: 'vivid', label: 'Vivid' }]} />
      <div data-part="stage">
        <h3>Ship the invoice</h3>
        <p>The same five components, the same props.</p>
        <Input label="Billing email" type="email" />
        <Switch defaultChecked>Send a receipt</Switch>
        <div data-part="row">
          <Button>Pay now</Button>
          <Button emphasis="outline" tone="neutral">Later</Button>
          <Badge tone="positive">Paid</Badge>
        </div>
      </div>
    </div>
  )
}
