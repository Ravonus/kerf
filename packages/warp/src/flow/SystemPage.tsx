import { announce, copyText, menu, uid } from '@weft/ui-core'
import { derived, state, untrack, watch } from 'weft'
import { Badge } from '../Badge'
import { Button } from '../Button'
import { Search, Textarea } from '../Field'
import { Avatar, Glyph } from '../parts'
import { toast } from '../Toast'
import { use } from '../use'
import { G } from './kit'
import '../styles'
import '@weft/ui-core/styles/flows/tokens.css'
import '@weft/ui-core/styles/flows/base.css'
import '@weft/ui-core/styles/app/tokens.css'
import '@weft/ui-core/styles/app/system-page.css'
import '@weft/ui-core/styles/flows/system-page.css'

const X = [8, 27.5, 47, 66.5, 86, 105.5, 125].map(x => ({ x }))
const Threads = ({ y2 = 84 }: { y2?: number }) => <>{X.map(t => <line key={t.x} x1={t.x} y1="0" x2={t.x} y2={y2} />)}</>

/** 404 and 500: a weft thread broken in two. */
const Broken = () => <svg data-part="weave" viewBox="0 0 132 84" preserveAspectRatio="none" aria-hidden="true"><Threads /><path pathLength="1" style="--i:0" d="M0 22H132" /><path pathLength="1" style="--i:1" d="M0 44H70" data-broken="" /><path pathLength="1" style="--i:2" d="M86 44H132" opacity=".35" /><path pathLength="1" style="--i:3" d="M0 64H132" /></svg>
/** First run: whole threads. */
const Whole = () => <svg data-part="weave" viewBox="0 0 132 84" preserveAspectRatio="none" aria-hidden="true"><Threads /><path pathLength="1" style="--i:0" d="M0 22H132" /><path pathLength="1" style="--i:1" d="M0 44H132" /><path pathLength="1" style="--i:2" d="M0 64H132" /></svg>
/** 403: a thread stops at a padlock on the crossing, in ink: nothing broke (07 §6.5). */
const Locked = () => (
  <svg data-part="weave" viewBox="0 0 132 84" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    {[16, 36, 56, 76, 96, 116].map(x => <line key={x} x1={x} y1="4" x2={x} y2="80" />)}
    <path pathLength="1" style="--i:0" d="M4 22 C 30 18, 40 26, 66 22 S 102 18, 128 22" />
    <path pathLength="1" style="--i:1" d="M4 62 C 30 58, 40 66, 66 62 S 102 58, 128 62" />
    <path pathLength="1" style="--i:2" d="M4 42 C 20 40, 34 44, 52 42" />
    <path data-part="shackle" d="M58 40 v-7 a8 8 0 0 1 16 0 v7" />
    <rect data-part="lock" x="54" y="39" width="24" height="19" rx="4" />
    <path data-part="keyhole" d="M66 46 v5" />
  </svg>
)

const focusTitle = (el: HTMLElement) => {
  el.focus({ preventScroll: true })
  return { update() {}, destroy() {} }
}

/** The title and code: every result page's top. */
function Head({ art, code, title, focus, as }: { art: any; code: any; title: any; focus?: boolean; as?: 'h2' | 'h3' }) {
  const h3 = derived(() => as === 'h3')
  let el: HTMLElement | undefined
  if (untrack(() => focus)) use(focusTitle, () => el)
  return <>
    <span data-part="art">{art}</span>
    <span data-part="code">{code}</span>
    {h3.value ? <h3 ref={(n: any) => (el = n)} data-part="title" tabindex="-1">{title}</h3> : <h2 ref={(n: any) => (el = n)} data-part="title" tabindex="-1">{title}</h2>}
  </>
}

function RequestId({ id }: { id: string }) {
  return <span data-part="meta">Request ID <code>{id}</code><Button emphasis="ghost" tone="neutral" size="sm" data-icon-only="" label="Copy request ID" onClick={async () => { await copyText(document, id); announce(document, 'Copied') }}><Glyph d={G.copy} /></Button></span>
}

export interface SwitchAccount { id: string; email: string; detail?: string; hasAccess?: boolean; current?: boolean }

function AccountMenu({ accounts, onSwitch }: { accounts: SwitchAccount[]; onSwitch?: (id: string | undefined) => void }) {
  const id = uid('accounts')
  const open = state(false)
  let list: HTMLElement | undefined
  use(menu, () => list, () => ({ open: open.value, trigger: () => list?.parentElement?.querySelector<HTMLElement>('[data-switch]'), onClose: () => (open.value = false) }))
  const pick = (a: string | undefined) => { open.value = false; list?.parentElement?.querySelector<HTMLElement>('[data-switch]')?.focus(); onSwitch?.(a) }
  return { open, id, press: () => (open.value = !open.value), menu: () => (
    <ul ref={(n: any) => (list = n)} data-part="accounts" role="menu" id={id} aria-label="Switch account" hidden={!open.value || undefined}>
      {accounts.map(a => (
        <li key={a.id} role="none">
          <button type="button" role="menuitem" tabindex="-1" onClick={() => pick(a.id)}>
            <Avatar name={a.email} size="sm" />
            <span>{a.email}{a.detail && <small>{a.detail}</small>}</span>
            {a.hasAccess ? <Badge tone="positive">Has access</Badge> : a.current ? <small>Current</small> : <span></span>}
          </button>
        </li>
      ))}
      <li role="none"><button type="button" role="menuitem" tabindex="-1" onClick={() => pick(undefined)}><Glyph d="M12 5v14M5 12h14" /><span>Use another account</span><span></span></button></li>
    </ul>
  ) }
}

export interface AccessRequest {
  /** The workspace takes access requests (default true). */
  allowed?: boolean
  /** A request is out: from the server, or set here after `onSend`. */
  pending?: boolean
  /** Who answers: "Kofi and Ana". */
  approvers?: string
  onSend?: (note: string) => unknown
  onWithdraw?: () => unknown
  /** "Copy link for the owner". */
  link?: string
}

export interface SystemPageProps {
  kind: '404' | '403' | '500' | 'maintenance' | 'empty'
  title?: any
  description?: any
  /** The eyebrow, when the default won't do. */
  code?: any
  /** The primary action's label and press (or `href`). */
  primary?: { label: any; onClick?: () => void; href?: string; loading?: boolean }
  secondary?: { label: any; onClick?: () => void; href?: string }
  /** 404: the search field. */
  onSearch?: (q: string) => void
  searchLabel?: string
  /** 500: `retry` from `<Boundary>`. */
  onRetry?: () => void
  /** The error, for the Boundary form; its message is never shown. */
  error?: unknown
  /** The support line. */
  requestId?: string
  /** Extra support text: a path, an incident. */
  meta?: any
  /** Maintenance: "Back at 14:00 UTC", and the local-time line in `description`. */
  backAt?: any
  /** 403: what was asked for and by whom. */
  object?: { title: string; owner?: string }
  account?: string
  request?: AccessRequest
  accounts?: SwitchAccount[]
  onSwitch?: (id: string | undefined) => void
  /** 403: access came through: `children` is the object, loaded in place. */
  granted?: boolean
  as?: 'h2' | 'h3'
  /** Focus the title on load, so the route change is heard (default: 403). */
  autofocus?: boolean
  children?: any
}

const TITLES = { 404: "We can't find that page", 403: "You don't have access", 500: 'Something went wrong on our side', maintenance: 'Back soon', empty: 'Nothing here yet' }
const CODES = { 404: '404 · Not found', 403: '403 · No access', 500: '500 · Server error', maintenance: 'Scheduled maintenance', empty: 'First run' }
const COPY = { 404: 'The link may be old, or the page has moved. Search for it, or head back to your dashboard.', 403: 'Ask an admin for access, or switch to an account that has it.', 500: "Your work is saved. We've been alerted and are looking at it now.", maintenance: "Nothing is lost, and nothing you saved is affected.", empty: undefined }

function Act({ a, emphasis, tone }: { a: { label: any; onClick?: () => void; href?: string; loading?: boolean }; emphasis?: any; tone?: any }) {
  const href = derived(() => a.href)
  return <Button emphasis={emphasis} tone={tone} loading={a.loading} role={href.value ? 'link' : undefined} onClick={() => (href.value ? location.assign(href.value) : a.onClick?.())}>{a.label}</Button>
}

/** 403's four states (07 §6.5): can request (then a note), pending, can't request, granted in place. */
function Denied(p: SystemPageProps) {
  const compose = state(false)
  const sent = state(false)
  const note = state('')
  const busy = state(false)
  const name = untrack(() => p.object?.title)
  const titleOf = name ? `You don't have access to ${name}` : TITLES[403]
  const approvers = derived(() => p.request?.approvers ?? p.object?.owner ?? 'the owner')
  const pending = derived(() => !!(p.request?.pending ?? sent.value))
  const allowed = derived(() => p.request?.allowed !== false)
  const view = derived(() => (p.granted ? 'granted' : pending.value ? 'pending' : !allowed.value ? 'closed' : compose.value ? 'compose' : 'request'))
  let root: HTMLElement | undefined
  const accounts = AccountMenu({ accounts: untrack(() => p.accounts ?? []), onSwitch: id => p.onSwitch?.(id) })
  watch(() => view.value, (v, was) => {
    if (was === undefined) return
    queueMicrotask(() => root?.querySelector<HTMLElement>(v === 'compose' ? 'textarea' : '[data-part="title"]')?.focus({ preventScroll: true }))
    if (v === 'granted') toast.show({ title: `${p.object?.owner ?? 'The owner'} gave you access`, description: `${name ?? 'It'} is open.`, tone: 'positive' })
  })
  const send = async () => {
    busy.value = true
    try {
      await p.request?.onSend?.(note.value)
      sent.value = true
      compose.value = false
      announce(document, `Request sent to ${approvers.value}. We'll email you when they answer.`)
    } finally { busy.value = false }
  }
  const withdraw = async () => { await p.request?.onWithdraw?.(); sent.value = false; note.value = ''; announce(document, 'Request withdrawn') }
  const copyLink = async () => { await copyText(document, p.request?.link ?? location.href); announce(document, `Link copied. Send it to ${approvers.value}.`) }
  const Switch = () => (p.accounts?.length ? <Button emphasis="ghost" tone="neutral" data-switch="" aria-haspopup="menu" aria-expanded={accounts.open.value ? 'true' : 'false'} aria-controls={accounts.id} onClick={accounts.press}>Switch account</Button> : p.onSwitch ? <Button emphasis="ghost" tone="neutral" onClick={() => p.onSwitch!(undefined)}>Switch account</Button> : null)
  return (
    <>
      {view.value === 'granted' ? p.children : (
        <div ref={(n: any) => (root = n)} data-scope="system-page">
          <div data-part="body">
            <Head art={<Locked />} code={p.code ?? CODES[403]} as={p.as} focus={p.autofocus ?? true} title={view.value === 'pending' ? 'Request sent' : (p.title ?? titleOf)} />
            {view.value === 'request' && <p>{p.description ?? <>{p.account ? `You're signed in as ${p.account}. ` : ''}Ask the owner for access, or switch to an account that has it.</>}</p>}
            {view.value === 'compose' && <p>{approvers.value} can share it. Add a note if it helps them decide.</p>}
            {view.value === 'closed' && <p>This workspace doesn't take access requests. Ask {approvers.value} to share it{p.account ? ` with ${p.account}` : ''}.</p>}
            {view.value === 'pending' && <span data-part="pending" role="status"><Glyph d={G.clock} /> Request sent to {approvers.value} · we'll email you when they answer</span>}
            {view.value === 'compose'
              ? (
                <div data-part="request">
                  <Textarea label="Note (optional)" hint="They'll see it with your request" counter={280} maxlength="280" value={note.value} onInput={e => (note.value = e.currentTarget.value)} />
                  <div data-part="actions">
                    <Button emphasis="ghost" tone="neutral" onClick={() => (compose.value = false)}>Cancel</Button>
                    <Button loading={busy.value} onClick={send}>Send request</Button>
                  </div>
                </div>
              )
              : (
                <div data-part="actions">
                  {view.value === 'request' && <Button onClick={() => (compose.value = true)}>Request access</Button>}
                  {view.value === 'pending' && <Button emphasis="outline" tone="neutral" onClick={withdraw}>Withdraw request</Button>}
                  {view.value === 'closed' && <Button onClick={copyLink}>Copy link for the owner</Button>}
                  <Switch />
                </div>
              )}
            {accounts.menu()}
            {p.requestId && <RequestId id={p.requestId} />}
          </div>
        </div>
      )}
    </>
  )
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
        <Head art={kind === 'empty' ? <Whole /> : <Broken />} code={p.code ?? CODES[kind]} as={p.as} focus={p.autofocus} title={p.title ?? (kind === 'maintenance' && p.backAt ? `Back at ${p.backAt}` : TITLES[kind])} />
        {text.value !== undefined && <p>{text.value}</p>}
        {kind === '404' && p.onSearch && (
          <form data-part="search" novalidate onSubmit={(e: SubmitEvent) => { e.preventDefault(); p.onSearch!(new FormData(e.currentTarget as HTMLFormElement).get('q') as string) }}>
            <Search label={p.searchLabel ?? 'Search'} name="q" />
          </form>
        )}
        <div data-part="actions">
          {kind === '500' && p.onRetry && <Button onClick={p.onRetry}><Glyph d={G.refresh} />Try again</Button>}
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
