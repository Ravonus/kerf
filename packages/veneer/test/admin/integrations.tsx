import { state } from '@kerf-js/core'
import { render } from '@kerf-js/core/test'
import {
  IntegrationsGrid,
  Webhooks,
  urlBreaks,
  type Integration,
} from '../../src/admin/Integrations'
import { Toaster } from '../../src/Toast'
import { HOOKS, INTEGRATIONS } from '../fixtures/pack-admin'
import { byText, dialog, tick, toasts, type } from './support'

function registerOneActionPerStateA() {
  test('one action per state; a critical solid only on the failing card; Connect lists, then leaves', async () => {
    const items = state<readonly Integration[]>(INTEGRATIONS)
    const went: string[] = []
    const { container: c } = render(() => (
      <div>
        <IntegrationsGrid
          items={items}
          onConnect={(x) => {
            went.push(x.id)
            items.value = items.value.map((i) => (i.id === x.id ? { ...i, state: 'pending' } : i))
          }}
          onDisconnect={() => {}}
        />
        <Toaster />
      </div>
    ))
    expect(c.querySelector('[data-state="error"] button')!.getAttribute('data-tone')).toBe(
      'critical',
    )
    byText(c.querySelector('li[data-state="off"]')!, 'Connect').click()
    await tick()
    expect(dialog().textContent).toContain('Comment on issues')
    expect(went).toEqual([])
    byText(dialog(), 'Continue to Linear').click()
    await tick()
    expect(went).toEqual(['linear'])
    expect(c.querySelector('li[data-state="pending"]')!.textContent).toContain('Connecting')
    items.value = items.value.map((i) =>
      i.id === 'linear' ? { ...i, state: 'connected', detail: 'acme' } : i,
    )
    await tick()
    expect(toasts()).toContain('Linear connected')
    expect(
      document.activeElement!.querySelector('[data-part="sweep-label"]')?.textContent ??
        document.activeElement!.textContent,
    ).toBe('Configure')
  })
  test('a webhook URL offers breaks after slashes and before dots, never inside a word', () => {
    expect(urlBreaks('https://hooks.acme.dev/deploys/v2?team=web&x=1')).toEqual([
      'https://',
      'hooks',
      '.acme',
      '.dev/',
      'deploys/',
      'v2',
      '?team=',
      'web&',
      'x=',
      '1',
    ])
    const { container: c } = render(() => (
      <Webhooks
        hooks={HOOKS}
        events={['a.b']}
        onAdd={() => Promise.resolve('whsec_1')}
        onTest={() => Promise.resolve({ status: 200, ms: 1 })}
      />
    ))
    const code = c.querySelector<HTMLElement>('[data-part="url"]')!
    expect(code.textContent).toBe(HOOKS[0]!.url)
    expect(code.querySelectorAll('wbr').length).toBe(urlBreaks(HOOKS[0]!.url).length - 1)
    expect(code.style.overflowWrap).toBe('break-word') // was anywhere: a URL broke mid-word
    expect(code.style.wordBreak).toBe('normal')
  })
}

function registerWebhooksHttpsCheckedOnSubmit() {
  test('webhooks: https checked on submit then live; the secret once; Send test reports', async () => {
    const added: unknown[] = []
    const { container: c } = render(() => (
      <>
        <Webhooks
          hooks={HOOKS}
          events={['a.b', 'c.d']}
          onAdd={(u, e) => {
            added.push([u, e])
            return Promise.resolve('whsec_1')
          }}
          onTest={() => Promise.resolve({ status: 200, ms: 82 })}
        />
        <Toaster />
      </>
    ))
    byText(c, 'Send test to https://hooks.acme.dev/deploys').click()
    await tick()
    expect(toasts()).toContain('Test delivered: 200')
    byText(c, 'Add endpoint').click()
    await tick()
    const d = dialog()
    const url = d.querySelector<HTMLInputElement>('input[type="url"]')!
    type(url, 'http://x.dev')
    await tick()
    expect(d.querySelector('[data-part="error"]')).toBeNull()
    byText(d, 'Add endpoint').click()
    await tick()
    expect(d.querySelector('[data-part="error"]')!.textContent).toMatch(/https/)
    type(url, 'https://x.dev/h')
    await tick()
    expect(d.querySelector('[data-part="error"]')).toBeNull()
    byText(d, 'Add endpoint').click()
    await tick()
    expect(added).toEqual([['https://x.dev/h', ['a.b', 'c.d']]])
    expect(d.querySelector<HTMLInputElement>('input[readonly]')!.value).toBe('whsec_1')
  })
}

export function registerIntegrations() {
  describe('Integrations', () => {
    registerOneActionPerStateA()
    registerWebhooksHttpsCheckedOnSubmit()
  })
}
