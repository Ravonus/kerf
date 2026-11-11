import { ArrowUpRightIcon } from '@kerf-js/veneer-icons'
import { derived, state, untrack, type State } from '@kerf-js/core'
import { Button } from '../Button'
import { Drawer } from '../Drawer'
import { Modal } from '../Modal'
import { toast } from '../Toast'
import { latch, read } from './atoms'
import { Card } from './Integrations/Card'
import '../styles'
import '@kerf-js/veneer-core/styles/flows/tokens.css'
import '@kerf-js/veneer-core/styles/flows/base.css'
import '@kerf-js/veneer-core/styles/rich/helpers.css'
import '@kerf-js/veneer-core/styles/layout/tokens.css'
import '@kerf-js/veneer-core/styles/layout/row.css'
import '@kerf-js/veneer-core/styles/layout/stack.css'
import '@kerf-js/veneer-core/styles/flows/integrations.css'
import '@kerf-js/veneer-core/styles/flows/integration.css'
import '@kerf-js/veneer-core/styles/flows/choice.css'

/** Where an integration stands. */
export type IntegrationState = 'connected' | 'error' | 'off' | 'pending'
/** One card of the integrations grid. */
export type Integration = {
  id: string
  name: string
  summary: string
  state: IntegrationState
  detail?: string | undefined
  failure?: string | undefined
  can?: string[] | undefined
}

/** Props for IntegrationsGrid. */
export interface IntegrationsGridProps {
  items: readonly Integration[] | State<readonly Integration[]>
  /** Open the provider's consent page; the card's `state` then comes back through `items`. */
  onConnect: (item: Integration) => void
  /** The Configure sheet's fields. */
  settings?: ((item: Integration) => unknown) | undefined
  onSave?: (item: Integration) => void
  onDisconnect: (item: Integration) => void
  onRestore?: (item: Integration) => void
}

function gridState(p: IntegrationsGridProps) {
  const list = derived(() => read(p.items))
  const connecting = state(false)
  const configuring = state(false)
  const armedC = latch(connecting)
  const armedS = latch(configuring)
  const pick = state<Integration | undefined>(undefined)
  const go = () => {
    connecting.value = false
    p.onConnect(pick.value!)
  }
  const name = derived(() => pick.value?.name ?? '')
  const disconnect = () => {
    const x = pick.value!
    configuring.value = false
    p.onDisconnect(x)
    toast.show({
      title: `${x.name} disconnected`,
      action: p.onRestore && { label: 'Undo', onClick: () => p.onRestore!(x) },
    })
  }
  return { items: list, connecting, configuring, armedC, armedS, pick, go, name, disconnect }
}

function gridView(p: IntegrationsGridProps, ctx: ReturnType<typeof gridState>) {
  return (
    <>
      <ul data-scope="integrations">
        {ctx.items.value.map((x) => (
          <Card
            key={x.id}
            item={x}
            onConnect={() => {
              ctx.pick.value = x
              ctx.connecting.value = true
            }}
            onConfigure={() => {
              ctx.pick.value = x
              ctx.configuring.value = true
            }}
          />
        ))}
      </ul>
      {ctx.armedC.value && (
        <Modal
          open={ctx.connecting}
          size="sm"
          title={`Connect ${ctx.name.value}`}
          description="You can disconnect any time."
          footer={
            <>
              <Button emphasis="frame" data-close="">
                Cancel
              </Button>
              <Button autofocus onClick={ctx.go}>
                Continue to {ctx.name.value}
                <ArrowUpRightIcon />
              </Button>
            </>
          }
        >
          <div data-scope="stack">
            <ul>
              {(ctx.pick.value?.can ?? []).map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <span class="muted">
              Next, {ctx.name.value} asks you to approve this in a new window.
            </span>
          </div>
        </Modal>
      )}
      {ctx.armedS.value && (
        <Drawer
          open={ctx.configuring}
          title={ctx.name.value}
          description={ctx.pick.value?.detail}
          footer={
            <>
              <Button emphasis="soft" tone="critical" onClick={ctx.disconnect}>
                Disconnect {ctx.name.value}
              </Button>
              <Button data-close="" onClick={() => p.onSave?.(ctx.pick.value!)}>
                Save
              </Button>
            </>
          }
        >
          {ctx.pick.value && p.settings?.(ctx.pick.value)}
        </Drawer>
      )}
    </>
  )
}

/**
 * The integrations grid (09 §4.6): a status badge with a dot, one line, one action; a failing card takes a critical
 * border and the page's only critical solid. Connect lists what the provider can do, then leaves for its consent page.
 */
export function IntegrationsGrid(props: IntegrationsGridProps) {
  const p = untrack(() => props)
  return gridView(p, gridState(p))
}

/** One webhook endpoint. */
export type Webhook = {
  id: string
  url: string
  events: string[]
  lastDelivery?: string
  healthy: boolean
}

/** Props for Webhooks. */
export interface WebhooksProps {
  hooks: readonly Webhook[] | State<readonly Webhook[]>
  events: string[]
  /** Returns the signing secret, shown once. */
  onAdd: (url: string, events: string[]) => Promise<string>
  /** Posts a sample event. */
  onTest: (hook: Webhook) => Promise<{ status: number; ms: number }>
}

export { urlBreaks, Webhooks } from './Integrations/Webhooks'
