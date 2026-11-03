import { ArrowUpRightIcon } from '@weft-js/warp-icons'
import { httpsEndpoint, uid } from '@weft-js/warp-core'
import { derived, state, type State, untrack, watch } from '@weft-js/core'
import { Alert } from '../Alert'
import { Badge } from '../Badge'
import { Button, type Tone } from '../Button'
import { Checkbox } from '../Choice'
import { Drawer } from '../Drawer'
import { Input } from '../Field'
import { Modal } from '../Modal'
import { Table, type Column } from '../Table'
import { toast } from '../Toast'
import { SecretReveal, useReveal } from './Secret'
import { afterFlush, guarded, latch, read } from './atoms'
import '../styles'
import '@weft-js/warp-core/styles/flows/tokens.css'
import '@weft-js/warp-core/styles/flows/base.css'
import '@weft-js/warp-core/styles/rich/helpers.css'
import '@weft-js/warp-core/styles/layout/tokens.css'
import '@weft-js/warp-core/styles/layout/row.css'
import '@weft-js/warp-core/styles/layout/stack.css'
import '@weft-js/warp-core/styles/flows/integrations.css'
import '@weft-js/warp-core/styles/flows/integration.css'
import '@weft-js/warp-core/styles/flows/choice.css'

/** Where an integration stands. */
export type IntegrationState = 'connected' | 'error' | 'off' | 'pending'
/** One card of the integrations grid. */
export type Integration = { id: string; name: string; summary: string; state: IntegrationState; detail?: string | undefined; failure?: string | undefined; can?: string[] | undefined }
const BADGE: Record<IntegrationState, [string, Tone | undefined, boolean]> = { connected: ['Connected', 'positive', true], error: ['Needs attention', 'critical', true], off: ['Not connected', undefined, false], pending: ['Connecting…', 'caution', true] }

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

function Card({ item, onConnect, onConfigure }: { item: Integration; onConnect: () => void; onConfigure: () => void }) {
  let configure: HTMLElement | undefined
  const id = uid('ig')
  const badge = derived(() => BADGE[item.state])
  watch(() => item.state, (now, was) => {
    if (was !== 'pending' || now !== 'connected') return
    toast.show({ title: `${untrack(() => item.name)} connected`, tone: 'positive' })
    afterFlush(() => configure?.focus())
  })
  return (
    <li data-scope="integration" data-state={item.state}>
      <span data-part="logo" aria-hidden="true">{item.name[0]}</span>
      <span data-part="info">
        <b id={id}>{item.name}</b>
        <Badge tone={badge.value[1]} dot={badge.value[2]}>{badge.value[0]}</Badge>
        <span class="muted">{item.state === 'off' ? item.summary : item.detail}</span>
      </span>
      {item.failure && <span data-part="actions"><Alert tone="critical" live>{item.failure}</Alert></span>}
      <span data-part="actions">
        {item.state === 'off' && <Button emphasis="frame" size="sm" aria-describedby={id} onClick={onConnect}>Connect</Button>}
        {item.state === 'error' && <Button size="sm" tone="critical" aria-describedby={id} onClick={onConnect}>Reconnect</Button>}
        {item.state === 'connected' && <Button ref={n => (configure = n)} emphasis="ghost" tone="neutral" size="sm" aria-describedby={id} onClick={onConfigure}>Configure</Button>}
      </span>
    </li>
  )
}

/**
 * The integrations grid (09 §4.6): a status badge with a dot, one line, one action; a failing card takes a critical
 * border and the page's only critical solid. Connect lists what the provider can do, then leaves for its consent page.
 */
export function IntegrationsGrid({ items, onConnect, settings, onSave, onDisconnect, onRestore }: IntegrationsGridProps) {
  const list = derived(() => read(items))
  const connecting = state(false)
  const configuring = state(false)
  const armedC = latch(connecting)
  const armedS = latch(configuring)
  const pick = state<Integration | undefined>(undefined)
  const go = () => { connecting.value = false; onConnect(pick.value!) }
  const name = derived(() => pick.value?.name ?? '')
  const disconnect = () => {
    const x = pick.value!
    configuring.value = false
    onDisconnect(x)
    toast.show({ title: `${x.name} disconnected`, action: onRestore && { label: 'Undo', onClick: () => onRestore(x) } })
  }
  return (
    <>
      <ul data-scope="integrations">
        {list.value.map(x => <Card key={x.id} item={x} onConnect={() => { pick.value = x; connecting.value = true }} onConfigure={() => { pick.value = x; configuring.value = true }} />)}
      </ul>
      {armedC.value && (
        <Modal open={connecting} size="sm" title={`Connect ${name.value}`} description="You can disconnect any time." footer={<><Button emphasis="frame" data-close="">Cancel</Button><Button autofocus onClick={go}>Continue to {name.value}<ArrowUpRightIcon /></Button></>}>
          <div data-scope="stack">
            <ul>{(pick.value?.can ?? []).map(t => <li key={t}>{t}</li>)}</ul>
            <span class="muted">Next, {name.value} asks you to approve this in a new window.</span>
          </div>
        </Modal>
      )}
      {armedS.value && (
        <Drawer open={configuring} title={name.value} description={pick.value?.detail} footer={<><Button emphasis="soft" tone="critical" onClick={disconnect}>Disconnect {name.value}</Button><Button data-close="" onClick={() => onSave?.(pick.value!)}>Save</Button></>}>
          {pick.value && settings?.(pick.value)}
        </Drawer>
      )}
    </>
  )
}

/** One webhook endpoint. */
export type Webhook = { id: string; url: string; events: string[]; lastDelivery?: string; healthy: boolean }

/** Props for Webhooks. */
export interface WebhooksProps {
  hooks: readonly Webhook[] | State<readonly Webhook[]>
  events: string[]
  /** Returns the signing secret, shown once. */
  onAdd: (url: string, events: string[]) => Promise<string>
  /** Posts a sample event. */
  onTest: (hook: Webhook) => Promise<{ status: number; ms: number }>
}

/**
 * A URL that breaks where a reader would: after a slash or a query's `&` and `=`, before a dot, `?` or `#`, never inside a
 * word, nor after a hyphen in a host name. Each piece is an inline block, so lines break only between pieces (`<wbr>`
 * says so to anything reading the markup), and a piece longer than the line still breaks inside as a last resort.
 */
export const urlBreaks = (url: string): string[] => url.split(/(?<=[/&=])(?!\/)|(?=[.?#])/).filter(Boolean)
const Url = ({ href }: { href: string }) => (
  <code data-part="url" style="white-space:normal;word-break:normal;overflow-wrap:break-word">
    {urlBreaks(href).map((part, i) => [i ? <wbr /> : null, <span style="display:inline-block;max-inline-size:100%">{part}</span>])}
  </code>
)

/** Webhooks (09 §4.6): a DataTable of endpoints. Send test reports the code and time; a new signing secret is shown once. */
export function Webhooks({ hooks, events, onAdd, onTest }: WebhooksProps) {
  const adding = state(false)
  const armed = latch(adding)
  const { secret, seen } = useReveal(adding)
  const dialog = guarded(adding, () => !secret.value || seen.value)
  const url = state('')
  const picked = state<string[]>([])
  const urlError = state('')
  const eventError = state('')
  const tried = state(false)
  const busy = state(false)
  const list = derived(() => read(hooks))
  const check = () => { urlError.value = !url.value.trim() ? 'Enter the URL we should call.' : httpsEndpoint(url.value) ? '' : 'Use a full https:// URL.' }
  const test = async (h: Webhook) => {
    try {
      const r = await onTest(h)
      toast.show({ title: `Test delivered: ${r.status}`, description: `${h.url} answered in ${r.ms} ms.`, tone: r.status < 300 ? 'positive' : 'critical' })
    } catch { toast.show({ title: 'The test didn’t send', tone: 'critical', action: { label: 'Retry', onClick: () => test(h) } }) }
  }
  const save = async () => {
    if (busy.value) return
    tried.value = true
    check()
    eventError.value = picked.value.length ? '' : 'Pick at least one event.'
    if (urlError.value || eventError.value) return
    busy.value = true
    try { secret.value = await onAdd(url.value.trim(), picked.value) }
    catch { toast.show({ title: 'The endpoint wasn’t added', tone: 'critical', action: { label: 'Retry', onClick: save } }) }
    finally { busy.value = false }
  }
  const open = () => { url.value = ''; picked.value = events.slice(0, 2); urlError.value = ''; eventError.value = ''; tried.value = false; adding.value = true }
  const columns: Column<Webhook>[] = [
    { id: 'url', header: 'Endpoint', rowHeader: true, card: 'title', cell: h => <Url href={h.url} /> },
    { id: 'events', header: 'Events', value: h => h.events.join(', ') },
    { id: 'lastDelivery', header: 'Last delivery', value: h => h.lastDelivery ?? 'None yet' },
    { id: 'healthy', header: 'Health', card: 'badge', value: h => (h.healthy ? 'Healthy' : 'Failing'), cell: h => <Badge tone={h.healthy ? 'positive' : 'critical'} dot>{h.healthy ? 'Healthy' : 'Failing'}</Badge> },
    { id: 'test', header: 'Actions', value: () => '', cell: h => <Button emphasis="link" aria-label={`Send test to ${h.url}`} onClick={() => test(h)}>Send test</Button> },
  ]
  const tools = derived(() => <Button emphasis="frame" onClick={open}>Add endpoint</Button>) // one build: Table reads the prop twice
  const footer = derived(() => (secret.value
    ? <Button disabled={!seen.value} onClick={() => (dialog.value = false)}>Done</Button>
    : <><Button emphasis="frame" data-close="">Cancel</Button><Button loading={busy.value} onClick={save}>Add endpoint</Button></>))
  return (
    <div data-scope="stack">
      <Table caption="Webhook endpoints" captionHidden rows={list} columns={columns} picker={false} heading={3} actions={tools.value} empty={{ title: 'No webhooks yet', text: 'Add an endpoint to get events.' }} />
      {armed.value && (
        <Modal open={dialog} alert={!!secret.value} size="sm" title={secret.value ? 'Copy your signing secret' : 'Add a webhook endpoint'} description={secret.value ? 'You won’t see it again. Use it to verify our signature.' : 'We POST JSON to this URL for each event you pick.'} footer={<>{footer.value}</>}>
          {secret.value
            ? <SecretReveal label="Signing secret" secret={secret.value} done={seen} ack="I’ve saved this secret somewhere safe" />
            : (
              <form data-scope="stack" style="padding-block-start:var(--warp-space-related)" novalidate onSubmit={(e: Event) => { e.preventDefault(); void save() }}>
                <Input label="Endpoint URL" type="url" inputmode="url" placeholder="https://" autofocus hint="Must be https." value={url.value} error={urlError.value} onInput={e => { url.value = e.currentTarget.value; if (tried.value) check() }} />
                <fieldset data-scope="choice">
                  <legend>Events</legend>
                  {events.map(v => <Checkbox key={v} checked={picked.value.includes(v)} error={v === events[0] && eventError.value ? eventError.value : undefined} onChange={(e: Event) => { picked.value = (e.currentTarget as HTMLInputElement).checked ? [...picked.value, v] : picked.value.filter(x => x !== v); eventError.value = '' }}><code>{v}</code></Checkbox>)}
                </fieldset>
              </form>
            )}
        </Modal>
      )}
    </div>
  )
}
