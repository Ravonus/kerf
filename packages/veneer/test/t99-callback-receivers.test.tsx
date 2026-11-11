import { state } from '@kerf-js/core'
import { render } from '@kerf-js/core/test'
import { ApiKeys, type ApiKey, type ApiKeysProps, type KeyDraft } from '../src/admin/ApiKeys'
import { AuditLog, type AuditLogProps } from '../src/admin/Audit'
import { AUDIT, KEYS } from './fixtures/pack-admin'
import { NOW, byText, dialog, field, tick, type } from './admin/support'

function keysProps(): ApiKeysProps {
  return {
    keys: KEYS,
    now: NOW,
    onCreate: () => Promise.resolve('initial'),
    onRevoke: () => {},
  }
}

function pending<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

test('T99 reauth uses the current callback, props receiver, and its awaited decision', async () => {
  const props = keysProps()
  props.onReauth = () => Promise.resolve(true)
  const { container } = render(() => ApiKeys(props))
  const calls: Array<[unknown, string]> = []
  props.onReauth = function (this: unknown, reason) {
    calls.push([this, reason])
    return Promise.resolve(false)
  }
  byText(container, 'Create test key').click()
  await tick()
  expect(calls).toEqual([[props, 'Creating an API key needs a fresh sign-in.']])
  expect(dialog()).toBeNull()
  const approval = pending<boolean>()
  props.onReauth = function (this: unknown, reason) {
    calls.push([this, reason])
    return approval.promise
  }
  byText(container, 'Create test key').click()
  await tick()
  expect(dialog()).toBeNull()
  approval.resolve(true)
  await tick()
  expect(calls).toHaveLength(2)
  expect(calls[1]).toEqual([props, 'Creating an API key needs a fresh sign-in.'])
  expect(dialog()).not.toBeNull()
})

test('T99 create uses the current callback and awaits its result', async () => {
  const props = keysProps()
  const { container } = render(() => ApiKeys(props))
  const calls: Array<[unknown, KeyDraft]> = []
  const creation = pending<string>()
  props.onCreate = function (this: unknown, draft) {
    calls.push([this, draft])
    return creation.promise
  }
  byText(container, 'Create test key').click()
  await tick()
  const d = dialog()
  type(field(d, 'Key name'), 'New')
  await tick()
  byText(d, 'Create key').click()
  await tick()
  expect(calls).toEqual([[props, { name: 'New', scopes: ['read'], expires: '90' }]])
  expect(d.querySelector('input[readonly]')).toBeNull()
  creation.resolve('wk_test_replaced')
  await tick()
  expect(d.querySelector<HTMLInputElement>('input[readonly]')!.value).toBe('wk_test_replaced')
})

test('T99 revoke uses the current callback with the original key reference', async () => {
  const props = keysProps()
  const { container } = render(() => ApiKeys(props))
  const calls: Array<[unknown, ApiKey]> = []
  const revocation = pending<void>()
  props.onRevoke = function (this: unknown, key) {
    calls.push([this, key])
    return revocation.promise
  }
  byText(container, 'Revoke Metrics export').click()
  await tick()
  byText(dialog(), 'Revoke key').click()
  await tick()
  expect(calls).toHaveLength(1)
  expect(calls[0]![0]).toBe(props)
  expect(calls[0]![1]).toBe(KEYS[1])
  expect(dialog()).not.toBeNull()
  revocation.resolve(undefined)
  await tick()
  expect(dialog()).toBeNull()
})

test('T99 export keeps presence live and calls the replacement with the props receiver', async () => {
  const callback = state<AuditLogProps['onExport']>(undefined)
  const props = {
    events: AUDIT,
    now: NOW,
    get onExport() {
      return callback.value
    },
  } as AuditLogProps
  const { container } = render(() => AuditLog(props))
  expect(byText(container, 'Export CSV')).toBeUndefined()
  callback.value = () => Promise.resolve()
  await tick()
  const calls: unknown[] = []
  const result = pending<{ retryAfter: number }>()
  callback.value = function (this: unknown) {
    calls.push(this)
    return result.promise
  }
  byText(container, 'Export CSV').click()
  await tick()
  expect(calls).toEqual([props])
  expect(byText(container, 'Export CSV')).toBeDefined()
  result.resolve({ retryAfter: 2 })
  await tick()
  expect(byText(container, 'Try again in 2s').getAttribute('aria-disabled')).toBe('true')
  callback.value = undefined
  await tick()
  expect(byText(container, 'Export CSV')).toBeUndefined()
})

test('T99 create rejection keeps the form available for retry', async () => {
  const props = keysProps()
  const { container } = render(() => ApiKeys(props))
  const receivers: unknown[] = []
  props.onCreate = function (this: unknown) {
    receivers.push(this)
    return Promise.reject(new Error('create failed'))
  }
  byText(container, 'Create test key').click()
  await tick()
  const d = dialog()
  type(field(d, 'Key name'), 'New')
  await tick()
  byText(d, 'Create key').click()
  await tick()
  expect(receivers).toEqual([props])
  expect(d.open).toBe(true)
  expect(field(d, 'Key name').value).toBe('New')
  expect(d.querySelector('input[readonly]')).toBeNull()
})

test('T99 revoke preserves a synchronous throw for the confirmation', async () => {
  const props = keysProps()
  const { container } = render(() => ApiKeys(props))
  const receivers: unknown[] = []
  props.onRevoke = function (this: unknown) {
    receivers.push(this)
    throw new Error('revoke failed')
  }
  byText(container, 'Revoke Metrics export').click()
  await tick()
  const d = dialog()
  byText(d, 'Revoke key').click()
  await tick()
  expect(receivers).toEqual([props])
  expect(d.open).toBe(true)
})
