import { fireEvent } from '@testing-library/dom'
import { state } from '@kerf/core'
import { render } from '@kerf/core/test'
import { ApiKeys, type ApiKey } from '../../src/admin/ApiKeys'
import { Toaster } from '../../src/Toast'
import { KEYS } from '../fixtures/pack-admin'
import { NOW, byText, dialog, field, tick, type } from './support'

function suiteContext() {
  const mount = (over: Partial<Parameters<typeof ApiKeys>[0]> = {}) => {
    const keys = state<readonly ApiKey[]>(KEYS)
    const gone: string[] = []
    const view = render(() => (
      <>
        <ApiKeys
          keys={keys}
          now={NOW}
          onCreate={() => Promise.resolve('wk_test_SECRET')}
          onRevoke={(k) => {
            gone.push(k.id)
            keys.value = keys.value.filter((x) => x !== k)
          }}
          {...over}
        />
        <Toaster />
      </>
    ))
    return { c: view.container, gone }
  }
  return { mount }
}

function registerReAuthFirstRefusedStops(ctx: ReturnType<typeof suiteContext>) {
  const { mount } = ctx
  test('re-auth first; refused stops', async () => {
    const asks: string[] = []
    const { c } = mount({
      onReauth: (r) => {
        asks.push(r)
        return Promise.resolve(false)
      },
    })
    byText(c, 'Create test key').click()
    await tick()
    expect(asks.length).toBe(1)
    expect(dialog()).toBeNull()
  })
  test('the key shows once and Done waits on the checkbox; Escape can’t lose it', async () => {
    const { c } = mount()
    byText(c, 'Create test key').click()
    await tick()
    const d = dialog()
    byText(d, 'Create key').click()
    await tick()
    expect(d.querySelector('[data-part="error"]')!.textContent).toMatch(/Name the key/)
    type(field(d, 'Key name'), 'CI deploys')
    await tick()
    byText(d, 'Create key').click()
    await tick()
    expect(d.querySelector('[data-part="error"]')!.textContent).toMatch(/already have/)
    type(field(d, 'Key name'), 'New')
    await tick()
    byText(d, 'Create key').click()
    await tick()
    expect(d.querySelector<HTMLInputElement>('input[readonly]')!.value).toBe('wk_test_SECRET')
    const done = byText(d, 'Done') as HTMLButtonElement
    expect(done.disabled).toBe(true)
    fireEvent(d, new Event('cancel', { cancelable: true }))
    await tick()
    expect(d.open).toBe(true)
    d.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()
    await tick()
    expect(done.disabled).toBe(false)
    done.click()
    await tick()
    expect(d.textContent).not.toContain('wk_test_SECRET')
  })
  test('revoke is type-to-confirm when used in the last day, a plain alert otherwise', async () => {
    const { c, gone } = mount()
    byText(c, 'Revoke Metrics export').click()
    await tick()
    expect(dialog().querySelector('input')).toBeNull()
    byText(dialog(), 'Revoke key').click()
    await tick()
    expect(gone).toEqual(['k2'])
    byText(c, 'Revoke CI deploys').click()
    await tick()
    const d = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].at(-1)!
    expect((byText(d, 'Revoke key') as HTMLButtonElement).disabled).toBe(true)
    type(d.querySelector('input')!, 'CI deploys')
    await tick()
    byText(d, 'Revoke key').click()
    await tick()
    expect(gone).toEqual(['k2', 'k1'])
  })
}

export function registerApiKeys() {
  describe('ApiKeys', () => {
    const ctx = suiteContext()
    registerReAuthFirstRefusedStops(ctx)
  })
}
