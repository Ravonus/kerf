import { httpsEndpoint } from '@weft-js/warp-core'
import { derived, state, type State } from '@weft-js/core'
import { Badge } from '../../Badge'
import { Button } from '../../Button'
import { Checkbox } from '../../Choice'
import { Input } from '../../Field'
import { Modal } from '../../Modal'
import { Table, type Column } from '../../Table'
import { toast } from '../../Toast'
import { SecretReveal, useReveal } from '../Secret'
import { guarded, latch, read } from '../atoms'
import type { Webhook, WebhooksProps } from '../Integrations'
import '../../styles'
import '@weft-js/warp-core/styles/flows/tokens.css'
import '@weft-js/warp-core/styles/flows/base.css'
import '@weft-js/warp-core/styles/rich/helpers.css'
import '@weft-js/warp-core/styles/layout/tokens.css'
import '@weft-js/warp-core/styles/layout/row.css'
import '@weft-js/warp-core/styles/layout/stack.css'
import '@weft-js/warp-core/styles/flows/integrations.css'
import '@weft-js/warp-core/styles/flows/integration.css'
import '@weft-js/warp-core/styles/flows/choice.css'

/**
 * A URL that breaks where a reader would: after a slash or a query's `&` and `=`, before a dot, `?` or `#`, never inside a
 * word, nor after a hyphen in a host name. Each piece is an inline block, so lines break only between pieces (`<wbr>`
 * says so to anything reading the markup), and a piece longer than the line still breaks inside as a last resort.
 */
export const urlBreaks = (url: string): string[] =>
  url.split(/(?<=[/&=])(?!\/)|(?=[.?#])/).filter(Boolean)
const Url = ({ href }: { href: string }) => (
  <code data-part="url" style="white-space:normal;word-break:normal;overflow-wrap:break-word">
    {urlBreaks(href).map((part, i) => [
      i ? <wbr /> : null,
      <span style="display:inline-block;max-inline-size:100%">{part}</span>,
    ])}
  </code>
)

function webhookColumns(test: (h: Webhook) => Promise<void>): Column<Webhook>[] {
  return [
    {
      id: 'url',
      header: 'Endpoint',
      rowHeader: true,
      card: 'title',
      cell: (h) => <Url href={h.url} />,
    },
    { id: 'events', header: 'Events', value: (h) => h.events.join(', ') },
    { id: 'lastDelivery', header: 'Last delivery', value: (h) => h.lastDelivery ?? 'None yet' },
    {
      id: 'healthy',
      header: 'Health',
      card: 'badge',
      value: (h) => (h.healthy ? 'Healthy' : 'Failing'),
      cell: (h) => (
        <Badge tone={h.healthy ? 'positive' : 'critical'} dot>
          {h.healthy ? 'Healthy' : 'Failing'}
        </Badge>
      ),
    },
    {
      id: 'test',
      header: 'Actions',
      value: () => '',
      cell: (h) => (
        <Button emphasis="link" aria-label={`Send test to ${h.url}`} onClick={() => test(h)}>
          Send test
        </Button>
      ),
    },
  ]
}

function webhookForm(
  events: () => string[],
  url: State<string>,
  picked: State<string[]>,
  urlError: State<string>,
  eventError: State<string>,
  tried: State<boolean>,
  check: () => void,
  save: () => Promise<void>,
) {
  const live = {
    get events() {
      return events()
    },
  }
  return (
    <form
      data-scope="stack"
      style="padding-block-start:var(--warp-space-related)"
      novalidate
      onSubmit={(e: Event) => {
        e.preventDefault()
        void save()
      }}
    >
      <Input
        label="Endpoint URL"
        type="url"
        inputmode="url"
        placeholder="https://"
        autofocus
        hint="Must be https."
        value={url.value}
        error={urlError.value}
        onInput={(e) => {
          url.value = e.currentTarget.value
          if (tried.value) check()
        }}
      />
      <fieldset data-scope="choice">
        <legend>Events</legend>
        {live.events.map((v) => (
          <Checkbox
            key={v}
            checked={picked.value.includes(v)}
            error={v === live.events[0] && eventError.value ? eventError.value : undefined}
            onChange={(e: Event) => {
              picked.value = (e.currentTarget as HTMLInputElement).checked
                ? [...picked.value, v]
                : picked.value.filter((x) => x !== v)
              eventError.value = ''
            }}
          >
            <code>{v}</code>
          </Checkbox>
        ))}
      </fieldset>
    </form>
  )
}

function webhookTester(onTest: WebhooksProps['onTest']) {
  const test = async (h: Webhook) => {
    try {
      const r = await onTest(h)
      toast.show({
        title: `Test delivered: ${r.status}`,
        description: `${h.url} answered in ${r.ms} ms.`,
        tone: r.status < 300 ? 'positive' : 'critical',
      })
    } catch {
      toast.show({
        title: 'The test didn’t send',
        tone: 'critical',
        action: { label: 'Retry', onClick: () => test(h) },
      })
    }
  }
  return test
}

function webhookFooter(
  secret: State<string>,
  seen: State<boolean>,
  dialog: State<boolean>,
  busy: State<boolean>,
  save: () => Promise<void>,
) {
  return derived(() =>
    secret.value ? (
      <Button disabled={!seen.value} onClick={() => (dialog.value = false)}>
        Done
      </Button>
    ) : (
      <>
        <Button emphasis="frame" data-close="">
          Cancel
        </Button>
        <Button loading={busy.value} onClick={save}>
          Add endpoint
        </Button>
      </>
    ),
  )
}

function webhookSaver(
  onAdd: WebhooksProps['onAdd'],
  busy: State<boolean>,
  tried: State<boolean>,
  check: () => void,
  eventError: State<string>,
  picked: State<string[]>,
  urlError: State<string>,
  url: State<string>,
  secret: State<string>,
) {
  const save = async () => {
    if (busy.value) return
    tried.value = true
    check()
    eventError.value = picked.value.length ? '' : 'Pick at least one event.'
    if (urlError.value || eventError.value) return
    busy.value = true
    try {
      secret.value = await onAdd(url.value.trim(), picked.value)
    } catch {
      toast.show({
        title: 'The endpoint wasn’t added',
        tone: 'critical',
        action: { label: 'Retry', onClick: save },
      })
    } finally {
      busy.value = false
    }
  }
  return save
}

function validateUrl(url: State<string>, urlError: State<string>) {
  urlError.value = !url.value.trim()
    ? 'Enter the URL we should call.'
    : httpsEndpoint(url.value)
      ? ''
      : 'Use a full https:// URL.'
}

/** Webhooks (09 §4.6): a DataTable of endpoints. Send test reports the code and time; a new signing secret is shown once. */
export function Webhooks(props: WebhooksProps) {
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
  const list = derived(() => read(props.hooks))
  const check = () => validateUrl(url, urlError)
  const test = webhookTester((hook) => props.onTest(hook))
  const save = webhookSaver(
    (endpoint, selected) => props.onAdd(endpoint, selected),
    busy,
    tried,
    check,
    eventError,
    picked,
    urlError,
    url,
    secret,
  )
  const open = () => {
    url.value = ''
    picked.value = props.events.slice(0, 2)
    urlError.value = ''
    eventError.value = ''
    tried.value = false
    adding.value = true
  }
  const columns = webhookColumns(test)
  const tools = derived(() => (
    <Button emphasis="frame" onClick={open}>
      Add endpoint
    </Button>
  )) // one build: Table reads the prop twice
  const footer = webhookFooter(secret, seen, dialog, busy, save)
  return (
    <div data-scope="stack">
      <Table
        caption="Webhook endpoints"
        captionHidden
        rows={list}
        columns={columns}
        picker={false}
        heading={3}
        actions={tools.value}
        empty={{ title: 'No webhooks yet', text: 'Add an endpoint to get events.' }}
      />
      {armed.value && (
        <Modal
          open={dialog}
          alert={!!secret.value}
          size="sm"
          title={secret.value ? 'Copy your signing secret' : 'Add a webhook endpoint'}
          description={
            secret.value
              ? 'You won’t see it again. Use it to verify our signature.'
              : 'We POST JSON to this URL for each event you pick.'
          }
          footer={<>{footer.value}</>}
        >
          {secret.value ? (
            <SecretReveal
              label="Signing secret"
              secret={secret.value}
              done={seen}
              ack="I’ve saved this secret somewhere safe"
            />
          ) : (
            webhookForm(() => props.events, url, picked, urlError, eventError, tried, check, save)
          )}
        </Modal>
      )}
    </div>
  )
}
