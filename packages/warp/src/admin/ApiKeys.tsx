import { agoText } from '@weft-js/warp-core'
import { derived, state, type State } from '@weft-js/core'
import { Badge } from '../Badge'
import { Button } from '../Button'
import type { Column } from '../Table'
import { useReveal } from './Secret'
import { guarded, latch, read } from './atoms'
import { createKeyActions, revokeKeyActions } from './ApiKeys-actions'
import { keyView } from './ApiKeys-view'
import '../styles'
import '@weft-js/warp-core/styles/flows/tokens.css'
import '@weft-js/warp-core/styles/flows/base.css'
import '@weft-js/warp-core/styles/rich/helpers.css'
import '@weft-js/warp-core/styles/layout/tokens.css'
import '@weft-js/warp-core/styles/layout/row.css'
import '@weft-js/warp-core/styles/layout/stack.css'
import '@weft-js/warp-core/styles/flows/api-key.css'
import '@weft-js/warp-core/styles/flows/choice.css'

/** An API key as listed: never the secret, only its prefix. */
export type ApiKey = {
  id: string
  name: string
  prefix: string
  scopes: string[]
  created: string
  lastUsed?: string
}
/** What the create form hands to `onCreate`. */
export type KeyDraft = { name: string; scopes: string[]; expires: string }

/** Props for ApiKeys. */
export interface ApiKeysProps {
  keys: readonly ApiKey[] | State<readonly ApiKey[]>
  kind?: 'test' | 'live' | undefined
  /** Now, for "last used" and the 24-hour revoke rule. */
  now: string
  scopes?: { value: string; label: string }[]
  expiries?: { value: string; label: string }[]
  /** Fresh credentials first (09 §2.1, a 5-minute grant); false stops. */
  onReauth?: (reason: string) => Promise<boolean>
  /** Returns the full secret, which leaves this component only through the Copy button. */
  onCreate: (draft: KeyDraft) => Promise<string>
  onRevoke: (key: ApiKey) => Promise<void> | void
}

const SCOPES = [
  { value: 'read', label: 'Read projects and deploys' },
  { value: 'deploy', label: 'Trigger deploys' },
  { value: 'admin', label: 'Manage members (admins only)' },
]
const EXPIRIES = [
  { value: '30', label: 'In 30 days' },
  { value: '90', label: 'In 90 days' },
  { value: 'never', label: 'Never' },
]

/**
 * API keys (09 §4.2): a DataTable of prefixes. Create asks for re-auth, then name, scopes and expiry, then shows the key
 * once: it can't be dismissed before "I've saved it". Revoke is type-to-confirm when the key was used in the last 24 h.
 * Live keys sit behind SignGate, which the app wraps around this component.
 */
export function ApiKeys({
  keys,
  kind = 'test',
  now,
  scopes = SCOPES,
  expiries = EXPIRIES,
  onReauth,
  onCreate,
  onRevoke,
}: ApiKeysProps) {
  const creating = state(false)
  const { secret, seen } = useReveal(creating)
  const dialog = guarded(creating, () => !secret.value || seen.value)
  const armed = latch(creating)
  const name = state('')
  const chosen = state<string[]>(['read'])
  const expires = state('90')
  const nameError = state('')
  const scopeError = state('')
  const busy = state(false)
  const revoking = state<ApiKey | undefined>(undefined)
  const typedOpen = state(false)
  const plainOpen = state(false)
  let opener: HTMLElement | undefined
  let form: HTMLElement | undefined
  const list = derived(() => read(keys))
  const title = derived(() => (kind === 'live' ? 'live' : 'test'))

  const context = {
    creating,
    name,
    chosen,
    expires,
    nameError,
    scopeError,
    busy,
    secret,
    list,
    revoking,
    typedOpen,
    plainOpen,
    now: () => now,
    hasReauth: () => !!onReauth,
    onReauth: (reason: string) => onReauth!(reason),
    onCreate: (draft: KeyDraft) => onCreate(draft),
    onRevoke: (key: ApiKey) => onRevoke(key),
    getForm: () => form,
    getOpener: () => opener,
    setOpener: (n: HTMLElement) => (opener = n),
  }
  const { start, make, toggle } = createKeyActions(context)
  const { revoke, gone } = revokeKeyActions(context)
  const columns = apiKeyColumns(
    () => now,
    (k, e) => {
      opener ??= e.currentTarget as HTMLElement
      revoke(k)
    },
  )
  const tools = derived(() => <Button onClick={start}>{`Create ${title.value} key`}</Button>) // one build: Table reads the prop twice
  const footer = keyFooter(secret, seen, dialog, busy, make)
  return keyView({
    ...context,
    make,
    toggle,
    gone,
    armed,
    dialog,
    seen,
    title,
    tools,
    footer,
    columns,
    scopes: () => scopes,
    expiries: () => expiries,
    setForm: (n) => (form = n),
  })
}

function apiKeyColumns(
  now: () => string,
  revokeClick: (key: ApiKey, e: MouseEvent) => void,
): Column<ApiKey>[] {
  return [
    {
      id: 'name',
      header: 'Name',
      rowHeader: true,
      card: 'title',
      cell: (k) => (
        <span data-scope="row">
          <b>{k.name}</b>
          {k.scopes.map((s) => (
            <Badge key={s}>{s}</Badge>
          ))}
        </span>
      ),
    },
    {
      id: 'prefix',
      header: 'Key',
      cell: (k) => (
        <span data-scope="api-key">
          <code data-part="prefix">{k.prefix}…</code>
        </span>
      ),
    },
    { id: 'created', header: 'Created' },
    {
      id: 'lastUsed',
      header: 'Last used',
      value: (k) => (k.lastUsed ? agoText(k.lastUsed, now()) : 'Never'),
    },
    {
      id: 'revoke',
      header: 'Actions',
      value: () => '',
      cell: (k) => (
        <Button
          emphasis="soft"
          tone="critical"
          size="sm"
          aria-label={`Revoke ${k.name}`}
          onClick={(e: MouseEvent) => revokeClick(k, e)}
        >
          Revoke
        </Button>
      ),
    },
  ]
}

function keyFooter(
  secret: State<string>,
  seen: State<boolean>,
  dialog: State<boolean>,
  busy: State<boolean>,
  make: () => Promise<void>,
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
        <Button loading={busy.value} onClick={make}>
          Create key
        </Button>
      </>
    ),
  )
}
