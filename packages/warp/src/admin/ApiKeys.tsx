import { KeyIcon } from '@weft-js/warp-icons'
import { agoText, usedWithinDay } from '@weft-js/warp-core'
import { derived, state, type State } from '@weft-js/core'
import { Badge } from '../Badge'
import { Button } from '../Button'
import { Checkbox } from '../Choice'
import { Input } from '../Field'
import { Modal } from '../Modal'
import { Select } from '../Select'
import { Table, type Column } from '../Table'
import { toast } from '../Toast'
import { ConfirmDialog, TypeToConfirm } from './Danger'
import { SecretReveal, useReveal } from './Secret'
import { afterFlush, guarded, latch, read } from './atoms'
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
export type ApiKey = { id: string; name: string; prefix: string; scopes: string[]; created: string; lastUsed?: string }
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

const SCOPES = [{ value: 'read', label: 'Read projects and deploys' }, { value: 'deploy', label: 'Trigger deploys' }, { value: 'admin', label: 'Manage members (admins only)' }]
const EXPIRIES = [{ value: '30', label: 'In 30 days' }, { value: '90', label: 'In 90 days' }, { value: 'never', label: 'Never' }]

/**
 * API keys (09 §4.2): a DataTable of prefixes. Create asks for re-auth, then name, scopes and expiry, then shows the key
 * once: it can't be dismissed before "I've saved it". Revoke is type-to-confirm when the key was used in the last 24 h.
 * Live keys sit behind SignGate, which the app wraps around this component.
 */
export function ApiKeys({ keys, kind = 'test', now, scopes = SCOPES, expiries = EXPIRIES, onReauth, onCreate, onRevoke }: ApiKeysProps) {
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

  const start = async (e: MouseEvent) => {
    opener = e.currentTarget as HTMLElement
    if (onReauth && !(await onReauth('Creating an API key needs a fresh sign-in.'))) return
    name.value = ''; chosen.value = ['read']; expires.value = '90'; nameError.value = ''; scopeError.value = ''
    creating.value = true
  }
  const make = async () => {
    if (busy.value) return
    const n = name.value.trim()
    nameError.value = !n ? 'Name the key so you can find it later.' : list.value.some(k => k.name.toLowerCase() === n.toLowerCase()) ? 'You already have a key with that name.' : ''
    scopeError.value = chosen.value.length ? '' : 'Pick at least one scope.'
    if (nameError.value || scopeError.value) return afterFlush(() => form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
    busy.value = true
    try { secret.value = await onCreate({ name: n, scopes: chosen.value, expires: expires.value }) }
    catch { toast.show({ title: 'The key wasn’t created', description: 'Try again in a moment.', tone: 'critical', action: { label: 'Retry', onClick: make } }) }
    finally { busy.value = false }
    if (secret.value) afterFlush(() => form?.ownerDocument.querySelector<HTMLElement>('dialog[open] input[readonly]')?.focus())
  }
  const toggle = (v: string, on: boolean) => { chosen.value = on ? [...chosen.value, v] : chosen.value.filter(x => x !== v); scopeError.value = '' }
  const revoke = (k: ApiKey) => {
    revoking.value = k
    if (usedWithinDay(k.lastUsed, now)) typedOpen.value = true
    else plainOpen.value = true
  }
  const gone = async () => {
    const k = revoking.value!
    await onRevoke(k)
    toast.show({ title: `“${k.name}” revoked`, description: 'Requests with it now get 401.', tone: 'critical' })
    afterFlush(() => opener?.focus())
  }
  const columns: Column<ApiKey>[] = [
    { id: 'name', header: 'Name', rowHeader: true, card: 'title', cell: k => <span data-scope="row"><b>{k.name}</b>{k.scopes.map(s => <Badge key={s}>{s}</Badge>)}</span> },
    { id: 'prefix', header: 'Key', cell: k => <span data-scope="api-key"><code data-part="prefix">{k.prefix}…</code></span> },
    { id: 'created', header: 'Created' },
    { id: 'lastUsed', header: 'Last used', value: k => (k.lastUsed ? agoText(k.lastUsed, now) : 'Never') },
    { id: 'revoke', header: 'Actions', value: () => '', cell: k => <Button emphasis="soft" tone="critical" size="sm" aria-label={`Revoke ${k.name}`} onClick={(e: MouseEvent) => { opener ??= e.currentTarget as HTMLElement; revoke(k) }}>Revoke</Button> },
  ]
  const tools = derived(() => <Button onClick={start}>{`Create ${title.value} key`}</Button>) // one build: Table reads the prop twice
  const footer = derived(() => (secret.value
    ? <Button disabled={!seen.value} onClick={() => (dialog.value = false)}>Done</Button>
    : <><Button emphasis="frame" data-close="">Cancel</Button><Button loading={busy.value} onClick={make}>Create key</Button></>))
  return (
    <div data-scope="stack">
      <Table caption={`${title.value === 'live' ? 'Live' : 'Test'} API keys`} captionHidden rows={list} columns={columns} picker={false} heading={3} actions={tools.value} empty={{ title: 'No keys yet', text: 'Create one to call the API.' }} />
      {armed.value && (
        <Modal open={dialog} alert={!!secret.value} title={secret.value ? 'Copy your new key' : `Create a ${title.value} key`} description={secret.value ? 'You won’t see it again. Store it in your secrets manager now.' : 'Give it a name you’ll recognise in the audit log.'} footer={<>{footer.value}</>}>
          {secret.value
            ? <SecretReveal label={name.value} secret={secret.value} done={seen} ack="I’ve saved this key somewhere safe" />
            : (
              <form ref={n => (form = n)} data-scope="stack" style="padding-block-start:var(--warp-space-related)" novalidate onSubmit={(e: Event) => { e.preventDefault(); void make() }}>
                <Input label="Key name" placeholder="e.g. CI deploys" autofocus value={name.value} error={nameError.value} onInput={e => { name.value = e.currentTarget.value; nameError.value = '' }} />
                <fieldset data-scope="choice">
                  <legend>Scopes</legend>
                  {scopes.map(s => <Checkbox key={s.value} checked={chosen.value.includes(s.value)} error={s === scopes[0] && scopeError.value ? scopeError.value : undefined} onChange={(e: Event) => toggle(s.value, (e.currentTarget as HTMLInputElement).checked)}>{s.label}</Checkbox>)}
                </fieldset>
                <Select label="Expires" options={expiries} value={expires.value} onChange={(e: Event) => (expires.value = (e.currentTarget as HTMLInputElement).value)} />
              </form>
            )}
        </Modal>
      )}
      <TypeToConfirm open={typedOpen} glyph={KeyIcon} title={`Revoke “${revoking.value?.name}”?`} description="This key was used in the last 24 hours. Anything using it stops working right away." confirmText={revoking.value?.name ?? ''} action="Revoke key" onConfirm={gone} />
      <ConfirmDialog open={plainOpen} glyph={KeyIcon} tone="critical" title={`Revoke “${revoking.value?.name}”?`} description="Anything still using it stops working right away." action="Revoke key" onConfirm={gone} />
    </div>
  )
}
