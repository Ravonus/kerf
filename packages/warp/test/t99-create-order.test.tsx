import { collect } from '../../core/src/index/state'
import { render } from '@weft-js/core/test'
import { ApiKeys, type ApiKeysProps, type KeyDraft } from '../src/admin/ApiKeys'
import { NOW, byText, dialog, field, tick, type } from './admin/support'

test('T99 captures the create callback before reading draft state', async () => {
  const trace: string[] = []
  const calls: Array<[unknown, KeyDraft]> = []
  let callback = function (this: unknown, draft: KeyDraft) {
    trace.push('original')
    calls.push([this, draft])
    return Promise.resolve('original secret')
  }
  const props: ApiKeysProps = {
    keys: [],
    now: NOW,
    get onCreate() {
      trace.push('lookup')
      return callback
    },
    onRevoke() {},
  }
  const [view, boxes] = collect(() => render(() => ApiKeys(props)))
  byText(view.container, 'Create test key').click()
  await tick()
  const d = dialog()
  type(field(d, 'Key name'), 'New')
  await tick()
  const chosen = boxes.find((box) => Array.isArray(box.v) && box.v.includes('read'))!
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(chosen), 'value')!
  let reads = 0
  Object.defineProperty(chosen, 'value', {
    configurable: true,
    get() {
      const value = descriptor.get!.call(this)
      if (++reads === 2) {
        trace.push('scopes')
        callback = function () {
          trace.push('replacement')
          return Promise.resolve('replacement secret')
        }
      }
      return value
    },
    set(value: unknown) {
      descriptor.set!.call(this, value)
    },
  })
  trace.length = 0
  try {
    byText(d, 'Create key').click()
    await tick()
    expect(trace).toEqual(['lookup', 'scopes', 'original'])
    expect(calls).toEqual([[props, { name: 'New', scopes: ['read'], expires: '90' }]])
    expect(d.querySelector<HTMLInputElement>('input[readonly]')!.value).toBe('original secret')
  } finally {
    delete (chosen as { value?: unknown }).value
  }
})
