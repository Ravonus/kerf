import { FileTextIcon, LockIcon, TrashIcon } from '@kerf-js/veneer-icons'
import { money } from '@kerf-js/veneer-core'
import { derived, state, type State } from '@kerf-js/core'
import { Badge } from '../Badge'
import { Button, type Tone } from '../Button'
import { Banner } from '../parts'
import { Table, type Column } from '../Table'
import { toast } from '../Toast'
import { use } from '@kerf-js/veneer-core/kerf'
import { read } from './atoms'
import '../styles'
import '@kerf-js/veneer-core/styles/flows/tokens.css'
import '@kerf-js/veneer-core/styles/flows/base.css'
import '@kerf-js/veneer-core/styles/rich/helpers.css'
import '@kerf-js/veneer-core/styles/layout/tokens.css'
import '@kerf-js/veneer-core/styles/layout/row.css'
import '@kerf-js/veneer-core/styles/layout/stack.css'
import '@kerf-js/veneer-core/styles/data/list.css'
import '@kerf-js/veneer-core/styles/flows/pay-frame.css'
import type { ProviderAppearance } from '../PaymentCard'

/** Where an invoice stands. */
export type InvoiceStatus = 'paid' | 'retrying' | 'failed' | 'open'
/** One invoice in the billing history. */
export type Invoice = {
  id: string
  date: string
  number: string
  status: InvoiceStatus
  amount: number
  pdf?: string
}
const STATUS: Record<InvoiceStatus, [string, Tone]> = {
  paid: ['Paid', 'positive'],
  retrying: ['Retrying', 'caution'],
  failed: ['Failed', 'critical'],
  open: ['Open', 'neutral'],
}

/** Invoices (09 §4.3): a DataTable; a failed payment pins a Banner above it with "Update payment method". */
export function Invoices({
  invoices,
  currency,
  locale,
  onUpdatePayment,
  onExport,
}: {
  invoices: readonly Invoice[] | State<readonly Invoice[]>
  currency?: string | undefined
  locale?: string | undefined
  onUpdatePayment?: () => void
  onExport?: () => void
}) {
  const list = derived(() => read(invoices))
  const failed = derived(() => list.value.some((i) => i.status === 'failed'))
  const columns = invoiceColumns(
    () => currency,
    () => locale,
  )
  const fix = derived(() => (
    <Button size="sm" tone="critical" onClick={() => onUpdatePayment?.()}>
      Update payment method
    </Button>
  )) // one build: Banner reads the prop twice
  const tools = derived(() =>
    onExport ? (
      <Button emphasis="ghost" tone="neutral" size="sm" onClick={onExport}>
        Export CSV
      </Button>
    ) : undefined,
  ) // one build: Table reads the prop twice
  return (
    <div data-scope="stack">
      {failed.value && (
        <Banner tone="critical" live="polite" actions={fix.value}>
          Your last payment failed. Update your card to keep this plan.
        </Banner>
      )}
      <Table
        caption="Invoices"
        captionHidden
        rows={list}
        columns={columns}
        picker={false}
        heading={3}
        actions={tools.value}
        empty={{
          title: 'No invoices yet',
          text: 'Your first one comes at the end of this period.',
        }}
      />
    </div>
  )
}

function invoiceColumns(
  currency: () => string | undefined,
  locale: () => string | undefined,
): Column<Invoice>[] {
  return [
    { id: 'date', header: 'Date', rowHeader: true, card: 'title' },
    { id: 'number', header: 'Number' },
    {
      id: 'status',
      header: 'Status',
      card: 'badge',
      cell: (i) => (
        <Badge tone={STATUS[i.status][1]} dot>
          {STATUS[i.status][0]}
        </Badge>
      ),
    },
    {
      id: 'amount',
      header: 'Amount',
      numeric: true,
      value: (i) => money(i.amount, currency(), locale()),
    },
    {
      id: 'pdf',
      header: 'Receipt',
      value: () => '',
      cell: (i) =>
        i.pdf ? (
          <a
            data-scope="button"
            data-emphasis="ghost"
            data-tone="neutral"
            data-size="sm"
            data-icon-only=""
            href={i.pdf}
            aria-label={`PDF for ${i.number}`}
          >
            <FileTextIcon />
          </a>
        ) : (
          ''
        ),
    },
  ]
}

/** A card on file. */
export type PaymentMethod = {
  id: string
  brand: string
  last4: string
  expires: string
  default?: boolean
}

/** Saved cards (09 §4.3): the last four only. Make default applies at once; remove gives Undo. Details live with the provider. */
export function PaymentMethods({
  methods,
  onAdd,
  onDefault,
  onRemove,
  onRestore,
}: {
  methods: readonly PaymentMethod[] | State<readonly PaymentMethod[]>
  onAdd?: () => void
  onDefault: (m: PaymentMethod) => void
  onRemove: (m: PaymentMethod) => void
  onRestore?: (m: PaymentMethod) => void
}) {
  const list = derived(() => read(methods))
  const name = (m: PaymentMethod) => `${m.brand} ending ${m.last4}`
  return (
    <div data-scope="stack">
      <ul data-scope="list" aria-label="Payment methods">
        {list.value.map((m) => (
          <li key={m.id}>
            <div data-part="item">
              <span></span>
              <span>
                <b>{name(m)}</b>
                <br />
                <span class="muted">Expires {m.expires}</span>
              </span>
              <span class="row">
                {m.default ? (
                  <Badge tone="neutral">Default</Badge>
                ) : (
                  <>
                    <Button
                      emphasis="link"
                      aria-label={`Make default: ${name(m)}`}
                      onClick={() => {
                        onDefault(m)
                        toast.show({ title: 'Default payment method changed', tone: 'positive' })
                      }}
                    >
                      Make default
                    </Button>
                    <Button
                      emphasis="ghost"
                      tone="critical"
                      size="sm"
                      data-icon-only=""
                      label={`Remove ${name(m)}`}
                      onClick={() => {
                        onRemove(m)
                        toast.show({
                          title: `${name(m)} removed`,
                          action: onRestore && { label: 'Undo', onClick: () => onRestore(m) },
                        })
                      }}
                    >
                      <TrashIcon />
                    </Button>
                  </>
                )}
              </span>
            </div>
          </li>
        ))}
      </ul>
      {onAdd && (
        <div>
          <Button emphasis="frame" size="sm" onClick={onAdd}>
            Add method
          </Button>
        </div>
      )}
      <span class="muted">
        Card details live with the payment provider; veneer only shows the last four digits.
      </span>
    </div>
  )
}

/** Props for PayFrame. */
export interface PayFrameProps {
  /** The iframe's title: what's inside it, for a screen reader (09 §1.5). */
  title: string
  /** The provider's hosted page. */
  src?: string
  /** Or mount the provider's fields here, with Veneer's tokens for its appearance API. */
  mount?: (el: HTMLElement, appearance: ProviderAppearance) => { destroy(): void }
  testMode?: boolean
  /** Ready once the provider says so; a `src` frame also flips on its load event. */
  ready?: boolean
}

/**
 * The payment slot (09 §4.3): Veneer styles it (border, radius, shimmer, test-mode badge) and passes tokens to the
 * provider. It's an iframe slot only: Veneer never renders a card field.
 */
export function PayFrame({ title, src, mount, testMode, ready }: PayFrameProps) {
  const loaded = state(false)
  const done = derived(() => !!ready || loaded.value)
  const hosted = derived(() => !!src)
  let host: HTMLDivElement | undefined
  use(
    (el: HTMLDivElement) => {
      if (!mount) return { update() {}, destroy() {} }
      const css = getComputedStyle(el)
      const token = (t: string) => css.getPropertyValue(`--veneer-${t}`).trim()
      const made = mount(el, {
        fontFamily: css.fontFamily,
        fontSize: token('text-control-size'),
        color: token('color-text'),
        errorColor: token('color-critical-text'),
        borderRadius: token('radius-control'),
        borderColor: token('color-border-control'),
      })
      return { update() {}, destroy: () => made.destroy() }
    },
    () => host,
  )
  return (
    <div
      data-scope="pay-frame"
      data-state={done.value ? undefined : 'loading'}
      aria-busy={done.value ? undefined : 'true'}
    >
      <div data-part="head">
        <span class="row">
          <LockIcon />
          Card fields are hosted by your payment provider
        </span>
        {testMode && <Badge tone="caution">Test mode</Badge>}
      </div>
      <div ref={(n) => (host = n)} data-part="slot" role="group" aria-label={title}>
        {!done.value && (
          <>
            <i data-loop=""></i>
            <div>
              <i data-loop=""></i>
              <i data-loop=""></i>
            </div>
          </>
        )}
        {hosted.value && (
          <iframe
            src={src}
            title={title}
            width="100%"
            height="148"
            frameborder="0"
            onLoad={() => (loaded.value = true)}
          ></iframe>
        )}
      </div>
    </div>
  )
}
