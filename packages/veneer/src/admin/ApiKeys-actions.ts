import { usedWithinDay } from '@kerf-js/veneer-core'
import type { State } from '@kerf-js/core'
import { toast } from '../Toast'
import { afterFlush } from './atoms'
import type { ApiKey, ApiKeysProps, KeyDraft } from './ApiKeys'

export type KeyActionsContext = {
  creating: State<boolean>
  name: State<string>
  chosen: State<string[]>
  expires: State<string>
  nameError: State<string>
  scopeError: State<string>
  busy: State<boolean>
  secret: State<string>
  list: { readonly value: readonly ApiKey[] }
  revoking: State<ApiKey | undefined>
  typedOpen: State<boolean>
  plainOpen: State<boolean>
  now: () => string
  hasReauth: () => boolean
  onReauth: NonNullable<ApiKeysProps['onReauth']>
  onCreate: (draft: () => KeyDraft) => Promise<string>
  onRevoke: ApiKeysProps['onRevoke']
  getForm: () => HTMLElement | undefined
  getOpener: () => HTMLElement | undefined
  setOpener: (node: HTMLElement) => void
}

export function createKeyActions({
  creating,
  name,
  chosen,
  expires,
  nameError,
  scopeError,
  busy,
  secret,
  list,
  hasReauth,
  onReauth,
  onCreate,
  getForm,
  setOpener,
}: KeyActionsContext) {
  const start = async (e: MouseEvent) => {
    setOpener(e.currentTarget as HTMLElement)
    if (hasReauth() && !(await onReauth('Creating an API key needs a fresh sign-in.'))) return
    name.value = ''
    chosen.value = ['read']
    expires.value = '90'
    nameError.value = ''
    scopeError.value = ''
    creating.value = true
  }
  const make = async () => {
    if (busy.value) return
    const n = name.value.trim()
    nameError.value = !n
      ? 'Name the key so you can find it later.'
      : list.value.some((k) => k.name.toLowerCase() === n.toLowerCase())
        ? 'You already have a key with that name.'
        : ''
    scopeError.value = chosen.value.length ? '' : 'Pick at least one scope.'
    if (nameError.value || scopeError.value)
      return afterFlush(() =>
        getForm()?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      )
    busy.value = true
    try {
      secret.value = await onCreate(() => ({
        name: n,
        scopes: chosen.value,
        expires: expires.value,
      }))
    } catch {
      toast.show({
        title: 'The key wasn’t created',
        description: 'Try again in a moment.',
        tone: 'critical',
        action: { label: 'Retry', onClick: make },
      })
    } finally {
      busy.value = false
    }
    if (secret.value)
      afterFlush(() =>
        getForm()
          ?.ownerDocument.querySelector<HTMLElement>('dialog[open] input[readonly]')
          ?.focus(),
      )
  }
  const toggle = (v: string, on: boolean) => {
    chosen.value = on ? [...chosen.value, v] : chosen.value.filter((x) => x !== v)
    scopeError.value = ''
  }
  return { start, make, toggle }
}

export function revokeKeyActions({
  revoking,
  typedOpen,
  plainOpen,
  now,
  onRevoke,
  getOpener,
}: KeyActionsContext) {
  const revoke = (k: ApiKey) => {
    revoking.value = k
    if (usedWithinDay(k.lastUsed, now())) typedOpen.value = true
    else plainOpen.value = true
  }
  const gone = async () => {
    const k = revoking.value!
    await onRevoke(k)
    toast.show({
      title: `“${k.name}” revoked`,
      description: 'Requests with it now get 401.',
      tone: 'critical',
    })
    afterFlush(() => getOpener()?.focus())
  }
  return { revoke, gone }
}
