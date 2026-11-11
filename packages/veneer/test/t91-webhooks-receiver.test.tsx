import { render } from '@kerf-js/core/test'
import { Webhooks, type WebhooksProps } from '../src/admin/Integrations'
import { Toaster } from '../src/Toast'
import { byText, dialog, tick, toasts, type } from './admin/support'
import { HOOKS } from './fixtures/pack-admin'

afterEach(() => {
  document.body.innerHTML = ''
})

test('webhook test uses the current callback and its original receiver', async () => {
  const first = vi.fn().mockResolvedValue({ status: 200, ms: 1 })
  const calls: unknown[] = []
  const props: WebhooksProps = {
    hooks: HOOKS,
    events: ['a.b'],
    onAdd: () => Promise.resolve('secret'),
    onTest: first,
  }
  const { container } = render(() => (
    <>
      {Webhooks(props)}
      <Toaster />
    </>
  ))
  props.onTest = function (this: unknown, hook) {
    calls.push(this, hook)
    return Promise.resolve({ status: 201, ms: 7 })
  }
  byText(container, `Send test to ${HOOKS[0]!.url}`).click()
  await tick()
  expect(first).not.toHaveBeenCalled()
  expect(calls[0]).toBe(props)
  expect(calls[1]).toBe(HOOKS[0])
  expect(toasts()).toContain('Test delivered: 201')
  props.onTest = function (this: unknown) {
    calls.push(this)
    throw new Error('offline')
  }
  byText(container, `Send test to ${HOOKS[0]!.url}`).click()
  await tick()
  expect(calls[2]).toBe(props)
  expect(toasts()).toContain('The test didn’t send')
})

test('webhook add uses the current callback and its original receiver', async () => {
  const first = vi.fn().mockResolvedValue('old')
  const calls: unknown[] = []
  const props: WebhooksProps = {
    hooks: HOOKS,
    events: ['a.b', 'c.d'],
    onAdd: first,
    onTest: () => Promise.resolve({ status: 200, ms: 1 }),
  }
  const { container } = render(() => (
    <>
      {Webhooks(props)}
      <Toaster />
    </>
  ))
  byText(container, 'Add endpoint').click()
  await tick()
  const d = dialog()
  type(d.querySelector<HTMLInputElement>('input[type="url"]')!, 'https://x.dev/h')
  props.onAdd = function (this: unknown) {
    calls.push(this)
    return Promise.reject(new Error('offline'))
  }
  byText(d, 'Add endpoint').click()
  await tick()
  expect(calls.shift()).toBe(props)
  expect(toasts()).toContain('The endpoint wasn’t added')
  props.onAdd = function (this: unknown, url, events) {
    calls.push(this, url, events)
    return Promise.resolve('new secret')
  }
  byText(d, 'Add endpoint').click()
  await tick()
  expect(first).not.toHaveBeenCalled()
  expect(calls[0]).toBe(props)
  expect(calls.slice(1)).toEqual(['https://x.dev/h', ['a.b', 'c.d']])
  expect(d.querySelector<HTMLInputElement>('input[readonly]')!.value).toBe('new secret')
})

test('webhook add captures its callback before reading the endpoint argument', async () => {
  const trace: string[] = []
  const endpoint = 'https://order.example/h'
  const old = function (this: unknown, url: string, events: string[]) {
    expect(this).toBe(props)
    expect(url).toBe(endpoint)
    expect(events).toEqual(['a.b'])
    trace.push('old')
    return Promise.resolve('secret')
  }
  const replacement = function () {
    trace.push('replacement')
    return Promise.resolve('wrong')
  }
  let callback = old
  const props: WebhooksProps = {
    hooks: HOOKS,
    events: ['a.b'],
    get onAdd() {
      trace.push('lookup')
      return callback
    },
    onTest: () => Promise.resolve({ status: 200, ms: 1 }),
  }
  const { container } = render(() => Webhooks(props))
  byText(container, 'Add endpoint').click()
  await tick()
  const d = dialog()
  type(d.querySelector<HTMLInputElement>('input[type="url"]')!, endpoint)
  let trims = 0
  const trim: (this: string) => string = Object.getOwnPropertyDescriptor(
    String.prototype,
    'trim',
  )!.value
  const spy = vi.spyOn(String.prototype, 'trim').mockImplementation(function (this: string) {
    if (this === endpoint && ++trims === 3) {
      trace.push('url')
      callback = replacement
    }
    return trim.call(this)
  })
  try {
    byText(d, 'Add endpoint').click()
  } finally {
    spy.mockRestore()
  }
  await tick()
  expect(trace).toEqual(['lookup', 'url', 'old'])
  expect(d.querySelector<HTMLInputElement>('input[readonly]')!.value).toBe('secret')
})
