import { ClockIcon, RefreshIcon } from '@kerf/veneer-icons'
import { announce, copyText } from '@kerf/veneer-core'
import { derived, state, untrack, watch } from '@kerf/core'
import { Button, type ButtonProps } from '../Button'
import { Search, Textarea } from '../Field'
import { toast } from '../Toast'
import { Broken, Whole, Locked, Head, RequestId } from './SystemPage/art'
import { AccountMenu } from './SystemPage/accounts'
import '../styles'
import '@kerf/veneer-core/styles/flows/tokens.css'
import '@kerf/veneer-core/styles/flows/base.css'
import '@kerf/veneer-core/styles/app/tokens.css'
import '@kerf/veneer-core/styles/app/system-page.css'
import '@kerf/veneer-core/styles/flows/system-page.css'

/** An account to switch to from a no-access page. */
export interface SwitchAccount {
  id: string
  email: string
  detail?: string
  hasAccess?: boolean
  current?: boolean | undefined
}

/** An access request, and how to send and withdraw it. */
export interface AccessRequest {
  /** The workspace takes access requests (default true). */
  allowed?: boolean
  /** A request is out: from the server, or set here after `onSend`. */
  pending?: boolean | undefined
  /** Who answers: "Kofi and Ana". */
  approvers?: string
  onSend?: ((note: string) => unknown) | undefined
  onWithdraw?: () => unknown
  /** "Copy link for the owner". */
  link?: string
}

/** Props for SystemPage. */
export interface SystemPageProps {
  kind: '404' | '403' | '500' | 'maintenance' | 'empty'
  title?: unknown
  description?: unknown
  /** The eyebrow, when the default won't do. */
  code?: unknown
  /** The primary action's label and press (or `href`). */
  primary?: {
    label: unknown
    onClick?: (() => void) | undefined
    href?: string
    loading?: boolean | undefined
  }
  secondary?: { label: unknown; onClick?: (() => void) | undefined; href?: string }
  /** 404: the search field. */
  onSearch?: (q: string) => void
  /** The 404 search field's label. Default "Search". */
  searchLabel?: string
  /** 500: `retry` from `<Boundary>`. */
  onRetry?: (() => void) | undefined
  /** The error, for the Boundary form; its message is never shown. */
  error?: unknown
  /** The support line. */
  requestId?: string
  /** Extra support text: a path, an incident. */
  meta?: unknown
  /** Maintenance: "Back at 14:00 UTC", and the local-time line in `description`. */
  backAt?: unknown
  /** 403: what was asked for and by whom. */
  object?: { title: string; owner?: string }
  /** 403: the signed-in account, as in "You're signed in as ana@kerf.dev". */
  account?: string
  /** 403: the access request: who approves it, whether it is pending, and what sending or withdrawing does. */
  request?: AccessRequest
  /** 403: other signed-in accounts, offered in a Switch account menu. */
  accounts?: SwitchAccount[]
  /** Called with the account picked, or undefined to sign in as someone else. */
  onSwitch?: (id: string | undefined) => void
  /** 403: access came through: `children` is the object, loaded in place. */
  granted?: boolean
  as?: 'h2' | 'h3' | undefined
  /** Focus the title on load, so the route change is heard (default: 403). */
  autofocus?: boolean
  children?: unknown
}

const TITLES = {
  404: "We can't find that page",
  403: "You don't have access",
  500: 'Something went wrong on our side',
  maintenance: 'Back soon',
  empty: 'Nothing here yet',
}
const CODES = {
  404: '404 · Not found',
  403: '403 · No access',
  500: '500 · Server error',
  maintenance: 'Scheduled maintenance',
  empty: 'First run',
}
const COPY = {
  404: 'The link may be old, or the page has moved. Search for it, or head back to your dashboard.',
  403: 'Ask an admin for access, or switch to an account that has it.',
  500: "Your work is saved. We've been alerted and are looking at it now.",
  maintenance: 'Nothing is lost, and nothing you saved is affected.',
  empty: undefined,
}

function Act({
  a,
  emphasis,
  tone,
}: {
  a: {
    label: unknown
    onClick?: (() => void) | undefined
    href?: string
    loading?: boolean | undefined
  }
  emphasis?: ButtonProps['emphasis'] | undefined
  tone?: ButtonProps['tone']
}) {
  const href = derived(() => a.href)
  return (
    <Button
      emphasis={emphasis}
      tone={tone}
      loading={a.loading}
      role={href.value ? 'link' : undefined}
      onClick={() => (href.value ? location.assign(href.value) : a.onClick?.())}
    >
      {a.label}
    </Button>
  )
}

/** 403's four states (07 §6.5): can request (then a note), pending, can't request, granted in place. */
function accountSwitch(p: SystemPageProps, accounts: ReturnType<typeof AccountMenu>) {
  return () =>
    p.accounts?.length ? (
      <Button
        emphasis="ghost"
        tone="neutral"
        data-switch=""
        aria-haspopup="menu"
        aria-expanded={accounts.open.value ? 'true' : 'false'}
        aria-controls={accounts.id}
        onClick={accounts.press}
      >
        Switch account
      </Button>
    ) : p.onSwitch ? (
      <Button emphasis="ghost" tone="neutral" onClick={() => p.onSwitch!(undefined)}>
        Switch account
      </Button>
    ) : null
}

async function copyOwnerLink(p: SystemPageProps, approvers: ReturnType<typeof derived<string>>) {
  await copyText(document, p.request?.link ?? location.href)
  announce(document, `Link copied. Send it to ${approvers.value}.`)
}

function deniedState(p: SystemPageProps) {
  const compose = state(false)
  const sent = state(false)
  const note = state('')
  const busy = state(false)
  const name = untrack(() => p.object?.title)
  const titleOf = name ? `You don't have access to ${name}` : TITLES[403]
  const approvers = derived(() => p.request?.approvers ?? p.object?.owner ?? 'the owner')
  const pending = derived(() => !!((p.request?.pending as unknown) ?? sent.value))
  const allowed = derived(() => p.request?.allowed !== false)
  const view = derived(() =>
    p.granted
      ? 'granted'
      : pending.value
        ? 'pending'
        : !allowed.value
          ? 'closed'
          : compose.value
            ? 'compose'
            : 'request',
  )
  let root: HTMLElement | undefined
  const accounts = AccountMenu({
    accounts: untrack(() => p.accounts ?? []),
    onSwitch: (id) => p.onSwitch?.(id),
  })
  watch(
    () => view.value,
    (v, was) => {
      if (was === undefined) return
      queueMicrotask(() =>
        root
          ?.querySelector<HTMLElement>(v === 'compose' ? 'textarea' : '[data-part="title"]')
          ?.focus({ preventScroll: true }),
      )
      if (v === 'granted')
        toast.show({
          title: `${p.object?.owner ?? 'The owner'} gave you access`,
          description: `${name ?? 'It'} is open.`,
          tone: 'positive',
        })
    },
  )
  const send = async () => {
    busy.value = true
    try {
      await p.request?.onSend?.(note.value)
      sent.value = true
      compose.value = false
      announce(document, `Request sent to ${approvers.value}. We'll email you when they answer.`)
    } finally {
      busy.value = false
    }
  }
  const withdraw = async () => {
    await p.request?.onWithdraw?.()
    sent.value = false
    note.value = ''
    announce(document, 'Request withdrawn')
  }
  const copyLink = () => copyOwnerLink(p, approvers)
  const Switch = accountSwitch(p, accounts)
  return {
    view,
    compose,
    note,
    busy,
    approvers,
    accounts,
    send,
    withdraw,
    copyLink,
    titleOf,
    Switch,
    setRoot: (n: HTMLElement) => {
      root = n
    },
  }
}

function deniedNote(note: ReturnType<typeof state<string>>) {
  return (
    <Textarea
      label="Note (optional)"
      hint="They'll see it with your request"
      counter={280}
      maxlength="280"
      value={note.value}
      onInput={(e) => (note.value = e.currentTarget.value)}
    />
  )
}

function deniedView(p: SystemPageProps, ctx: ReturnType<typeof deniedState>) {
  return (
    <>
      {ctx.view.value === 'granted' ? (
        p.children
      ) : (
        <div ref={(n) => ctx.setRoot(n)} data-scope="system-page">
          <div data-part="body">
            <Head
              art={<Locked />}
              code={p.code ?? CODES[403]}
              as={p.as}
              focus={p.autofocus ?? true}
              title={ctx.view.value === 'pending' ? 'Request sent' : (p.title ?? ctx.titleOf)}
            />
            {ctx.view.value === 'request' && (
              <p>
                {p.description ?? (
                  <>
                    {p.account ? `You're signed in as ${p.account}. ` : ''}Ask the owner for access,
                    or switch to an account that has it.
                  </>
                )}
              </p>
            )}
            {ctx.view.value === 'compose' && (
              <p>{ctx.approvers.value} can share it. Add a note if it helps them decide.</p>
            )}
            {ctx.view.value === 'closed' && (
              <p>
                This workspace doesn't take access requests. Ask {ctx.approvers.value} to share it
                {p.account ? ` with ${p.account}` : ''}.
              </p>
            )}
            {ctx.view.value === 'pending' && (
              <span data-part="pending" role="status">
                <ClockIcon /> Request sent to {ctx.approvers.value} · we'll email you when they
                answer
              </span>
            )}
            {ctx.view.value === 'compose' ? (
              <div data-part="request">
                {deniedNote(ctx.note)}
                <div data-part="actions">
                  <Button
                    emphasis="ghost"
                    tone="neutral"
                    onClick={() => (ctx.compose.value = false)}
                  >
                    Cancel
                  </Button>
                  <Button loading={ctx.busy.value} onClick={ctx.send}>
                    Send request
                  </Button>
                </div>
              </div>
            ) : (
              <div data-part="actions">
                {ctx.view.value === 'request' && (
                  <Button onClick={() => (ctx.compose.value = true)}>Request access</Button>
                )}
                {ctx.view.value === 'pending' && (
                  <Button emphasis="outline" tone="neutral" onClick={ctx.withdraw}>
                    Withdraw request
                  </Button>
                )}
                {ctx.view.value === 'closed' && (
                  <Button onClick={ctx.copyLink}>Copy link for the owner</Button>
                )}
                <ctx.Switch />
              </div>
            )}
            {ctx.accounts.menu()}
            {p.requestId && <RequestId id={p.requestId} />}
          </div>
        </div>
      )}
    </>
  )
}

function Denied(p: SystemPageProps) {
  const props = untrack(() => p)
  const ctx = deniedState(props)
  return deniedView(props, ctx)
}

/**
 * A result page (09 §5.1): art, code, title, one sentence, one primary, one secondary, the support line. It sits inside
 * the app shell, so navigation still works. `<Boundary error={(e, retry) => <SystemPage kind="500" error={e} onRetry={retry} />}>`
 * at the route level; 403 is the sharing state of 07 §6.5, and never shown to outsiders (they get the 404).
 */
export function SystemPage(p: SystemPageProps) {
  const kind = untrack(() => p.kind)
  if (kind === '403') return <Denied {...p} />
  const text = derived(() => p.description ?? COPY[kind])
  const home = derived(() => p.secondary)
  return (
    <div data-scope="system-page">
      <div data-part="body">
        <Head
          art={kind === 'empty' ? <Whole /> : <Broken />}
          code={p.code ?? CODES[kind]}
          as={p.as}
          focus={p.autofocus}
          title={
            p.title ??
            (kind === 'maintenance' && p.backAt ? `Back at ${p.backAt as string}` : TITLES[kind])
          }
        />
        {text.value !== undefined && <p>{text.value}</p>}
        {kind === '404' && p.onSearch && (
          <form
            data-part="search"
            novalidate
            onSubmit={(e: SubmitEvent) => {
              e.preventDefault()
              p.onSearch!(new FormData(e.currentTarget as HTMLFormElement).get('q') as string)
            }}
          >
            <Search label={p.searchLabel ?? 'Search'} name="q" />
          </form>
        )}
        <div data-part="actions">
          {kind === '500' && p.onRetry && (
            <Button onClick={p.onRetry}>
              <RefreshIcon />
              Try again
            </Button>
          )}
          {p.primary && <Act a={p.primary} />}
          {home.value && <Act a={home.value} emphasis="frame" />}
        </div>
        {p.meta !== undefined && <span data-part="meta">{p.meta}</span>}
        {p.requestId && <RequestId id={p.requestId} />}
        {p.children}
      </div>
    </div>
  )
}
