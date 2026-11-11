import { fireEvent, waitFor } from '@testing-library/dom'
import { flush, render } from '@kerf-js/core/test'
import { ComboField, type ComboFieldProps } from '../src/Combobox'

type Hit = { name: string }

function setup(overrides: Partial<ComboFieldProps<Hit>> = {}) {
  const props: ComboFieldProps<Hit> = {
    label: 'Search',
    text: () => '',
    find: () => Promise.resolve([]),
    row: (hit) => ({ main: hit.name }),
    onPick: () => {},
    ...overrides,
  }
  const { container } = render(() => ComboField(props))
  document.body.append(container)
  return { props, container, input: container.querySelector<HTMLInputElement>('input')! }
}

afterEach(() => {
  document.body.innerHTML = ''
})

test('search, status and selection use the current callback and original receiver', async () => {
  const hit: Hit = { name: 'Result' }
  const calls: [string, unknown, unknown?][] = []
  const oldFind = vi.fn(() => Promise.resolve([]))
  const oldPick = vi.fn()
  const oldStatus = vi.fn(() => 'Old')
  const { props, container, input } = setup({ find: oldFind, onPick: oldPick, status: oldStatus })
  props.find = function (this: unknown, query, signal) {
    calls.push(['find', this, [query, signal]])
    return Promise.resolve([hit])
  }
  props.row = function (this: unknown, value) {
    calls.push(['row', this, value])
    return { main: value.name }
  }
  props.onPick = function (this: unknown, value) {
    calls.push(['pick', this, value])
  }
  props.status = function (this: unknown) {
    calls.push(['status', this])
    return 'Ready'
  }
  input.value = '  result  '
  fireEvent.input(input)
  await waitFor(() => expect(container.querySelector('[role="option"]')).not.toBeNull())
  await flush()
  const found = calls.find(([name]) => name === 'find')!
  expect.soft(found[1]).toBe(props)
  expect((found[2] as [string, AbortSignal])[0]).toBe('result')
  expect((found[2] as [string, AbortSignal])[1]).toBeInstanceOf(AbortSignal)
  expect(calls.find(([name]) => name === 'row')).toEqual(['row', undefined, hit])
  await waitFor(() => expect(calls.some(([name]) => name === 'status')).toBe(true))
  expect.soft(calls.find(([name]) => name === 'status')?.[1]).toBe(props)
  ;(container.querySelector('[role="option"]') as HTMLElement).click()
  const picked = calls.find(([name]) => name === 'pick')!
  expect.soft(picked[1]).toBe(props)
  expect(picked[2]).toBe(hit)
  expect(oldFind).not.toHaveBeenCalled()
  expect(oldPick).not.toHaveBeenCalled()
})

test('escape clears text through the current optional callback with its original receiver', () => {
  const old = vi.fn()
  const calls: [unknown, string][] = []
  const { props, input } = setup({ onText: old })
  props.onText = function (this: unknown, text) {
    calls.push([this, text])
  }
  input.value = 'pending'
  fireEvent.input(input)
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(calls).toEqual([
    [props, 'pending'],
    [props, ''],
  ])
  expect(calls[0]![0]).toBe(props)
  expect(calls[1]![0]).toBe(props)
  expect(old).not.toHaveBeenCalled()
  delete props.onText
  input.value = 'pending'
  expect(() => fireEvent.keyDown(input, { key: 'Escape' })).not.toThrow()
  expect(calls).toHaveLength(2)
})

test('a rejected search calls the current failure callback with its original receiver', async () => {
  let reject!: (reason: Error) => void
  let started = false
  const old = vi.fn()
  const calls: unknown[] = []
  const { props, input } = setup({
    onFail: old,
    find: () =>
      new Promise<Hit[]>((_, fail) => {
        started = true
        reject = fail
      }),
  })
  input.value = 'fail'
  fireEvent.input(input)
  await waitFor(() => expect(started).toBe(true))
  props.onFail = function (this: unknown) {
    calls.push(this)
  }
  reject(new Error('search failed'))
  await waitFor(() => expect(calls).toHaveLength(1))
  expect(calls[0]).toBe(props)
  expect(old).not.toHaveBeenCalled()
})

test('a rejected search tolerates an absent failure callback', async () => {
  let reject!: (reason: Error) => void
  let started = false
  const { input } = setup({
    find: () =>
      new Promise<Hit[]>((_, fail) => {
        started = true
        reject = fail
      }),
  })
  input.value = 'fail'
  fireEvent.input(input)
  await waitFor(() => expect(started).toBe(true))
  await waitFor(() => expect(input.getAttribute('aria-busy')).toBe('true'))
  reject(new Error('search failed'))
  await waitFor(() => expect(input.getAttribute('aria-busy')).toBeNull())
})

test('a synchronously thrown search reaches the failure callback', async () => {
  const problem = new Error('search failed before returning a promise')
  const calls: unknown[] = []
  const { props, input } = setup({
    find(this: unknown): Promise<Hit[]> {
      calls.push(this)
      throw problem
    },
    onFail(this: unknown) {
      calls.push(this)
    },
  })
  input.value = 'fail'
  fireEvent.input(input)
  await waitFor(() => expect(calls).toHaveLength(2))
  expect(calls[0]).toBe(props)
  expect(calls[1]).toBe(props)
})

test('a selection callback throw reaches the event error unchanged', async () => {
  const problem = new Error('pick failed')
  const errors: unknown[] = []
  const handler = (event: ErrorEvent) => {
    errors.push(event.error)
    event.preventDefault()
  }
  window.addEventListener('error', handler)
  try {
    const { props, container, input } = setup({ find: () => Promise.resolve([{ name: 'Result' }]) })
    const receivers: unknown[] = []
    props.onPick = function (this: unknown) {
      receivers.push(this)
      throw problem
    }
    input.value = 'result'
    fireEvent.input(input)
    await waitFor(() => expect(container.querySelector('[role="option"]')).not.toBeNull())
    ;(container.querySelector('[role="option"]') as HTMLElement).click()
    expect(receivers).toHaveLength(1)
    expect(receivers[0]).toBe(props)
    expect(errors).toEqual([problem])
  } finally {
    window.removeEventListener('error', handler)
  }
})

test('selection looks up the callback before reading the selected hit', async () => {
  const trace: string[] = []
  const hit: Hit = { name: 'Result' }
  const hits = [hit]
  Object.defineProperty(hits, '0', {
    configurable: true,
    get() {
      trace.push('hit')
      return hit
    },
  })
  const { props, container, input } = setup({ find: () => Promise.resolve(hits) })
  const callback = function (this: unknown, value: Hit) {
    expect(this).toBe(props)
    expect(value).toBe(hit)
    trace.push('called')
  }
  Object.defineProperty(props, 'onPick', {
    configurable: true,
    get() {
      trace.push('lookup')
      return callback
    },
  })
  input.value = 'result'
  fireEvent.input(input)
  await waitFor(() => expect(container.querySelector('[role="option"]')).not.toBeNull())
  trace.length = 0
  ;(container.querySelector('[role="option"]') as HTMLElement).click()
  expect(trace).toEqual(['lookup', 'hit', 'called'])
})

test('search looks up the callback before trimming its query', async () => {
  const trace: string[] = []
  const originalTrim = Object.getOwnPropertyDescriptor(String.prototype, 'trim')!.value as (
    this: string,
  ) => string
  const { props, input } = setup()
  let received: unknown
  Object.defineProperty(props, 'find', {
    configurable: true,
    get() {
      trace.push('lookup')
      return function (this: unknown, query: string) {
        trace.push('called')
        received = [this, query]
        return Promise.resolve([])
      }
    },
  })
  const trim = vi.spyOn(String.prototype, 'trim').mockImplementation(function (this: string) {
    if (this === '  query  ') trace.push('trim')
    return originalTrim.call(this)
  })
  try {
    input.value = '  query  '
    fireEvent.input(input)
    trace.length = 0
    await waitFor(() => expect(received).toBeDefined())
    expect(trace).toEqual(['lookup', 'trim', 'called'])
    expect(received).toEqual([props, 'query'])
  } finally {
    trim.mockRestore()
  }
})

test('an absent status leaves the field hint in place', () => {
  const { container } = setup({ hint: 'Fallback' })
  expect(container.textContent).toContain('Fallback')
})
