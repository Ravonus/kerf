import { derived, state } from '@kerf/core'
import { Badge, Button, Card } from '@kerf/veneer'

type Step = 'idle' | 'hosted' | 'waiting'

export default function Paywall() {
  const step = state<Step>('idle')
  // What the ledger says this user holds: the only
  // thing the page renders access from.
  const held = state<string[]>([])
  const pro = derived(() => held.value.includes('pro'))
  const log = state<{ n: number; text: string }[]>([])
  const note = (text: string) => {
    log.value = [
      ...log.value,
      { n: log.value.length, text },
    ]
  }
  const applied = new Set<string>()

  // Stands in for the rail posting a signed event to
  // /_kerf/x/pay/stripe. Applying one twice changes
  // nothing.
  const deliver = (id: string) => {
    if (applied.has(id)) {
      note(
        `${id} delivered again: already applied, ` +
          `nothing changes.`,
      )
      return
    }
    applied.add(id)
    held.value = ['pro']
    note(
      `${id} verified and applied: the purchase is ` +
        `active, entitlements poked.`,
    )
  }
  const checkout = () => {
    step.value = 'hosted'
    note(
      'checkout() opens the hosted page. ' +
        'Nothing is granted yet.',
    )
  }
  const pay = () => {
    step.value = 'waiting'
    note(
      'The buyer pays on the rail’s page and ' +
        'comes back.',
    )
    setTimeout(() => {
      deliver('evt_1')
      step.value = 'idle'
    }, 1200)
  }
  const close = () => {
    step.value = 'idle'
    note(
      'The buyer closes the page. No event, ' +
        'so nothing happens.',
    )
  }

  return (
    <PaywallView
      step={step}
      pro={pro}
      log={log}
      checkout={checkout}
      pay={pay}
      close={close}
      deliver={deliver}
    />
  )
}

function PaywallView({
  step,
  pro,
  log,
  checkout,
  pay,
  close,
  deliver,
}: {
  step: { value: Step }
  pro: { readonly value: boolean }
  log: { value: { n: number; text: string }[] }
  checkout: () => void
  pay: () => void
  close: () => void
  deliver: (id: string) => void
}) {
  const checkoutLabel = "The rail's hosted checkout page"
  return (
    <Card title="Pro, one plan">
      <p>
        Your plan:{' '}
        <Badge tone={pro.value ? 'positive' : 'neutral'}>
          {pro.value ? 'Pro' : 'Free'}
        </Badge>
      </p>
      {step.value === 'idle' && !pro.value && (
        <Button onClick={checkout}>Go Pro</Button>
      )}
      {step.value === 'hosted' && (
        <section aria-label={checkoutLabel}>
          <p>
            {'The provider’s checkout page (simulated)'}
          </p>
          <Button onClick={pay}>
            {'Pay with a test card'}
          </Button>{' '}
          <Button
            emphasis="ghost"
            tone="neutral"
            onClick={close}
          >
            Close it
          </Button>
        </section>
      )}
      {step.value === 'waiting' && (
        <p>
          {'Back on your site, waiting for the webhook…'}
        </p>
      )}
      {pro.value && (
        <Button
          tone="neutral"
          emphasis="ghost"
          onClick={() => deliver('evt_1')}
        >
          Redeliver the event
        </Button>
      )}
      <ol>
        {log.value.map((l) => (
          <li key={l.n}>{l.text}</li>
        ))}
      </ol>
    </Card>
  )
}
