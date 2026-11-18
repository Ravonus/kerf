import {
  Boundary,
  context,
  createRoot,
  effect,
  flush,
  getOwner,
  onCleanup,
  resource,
  state,
} from '@kerf-js/core'
import { hydrate, insert } from '@kerf-js/core/dom'
import { renderToString } from '@kerf-js/core/ssr'

test('a pending resource updates inside nested providers', async () => {
  const outer = context<string>()
  const inner = context<string>()
  const control = document.createElement('div')
  const nested = document.createElement('div')
  const preloaded = document.createElement('div')
  const { promise, resolve } = Promise.withResolvers<string>()
  const dispose = createRoot((end) => {
    const answer = resource(() => promise)
    const view = () =>
      outer.provide('outer', () => inner.provide('inner', () => () => answer.value ?? ''))
    insert(control, () => answer.value ?? '')
    insert(nested, view)
    insert(preloaded, () => (answer.value ? view() : ''))
    return end
  })
  try {
    expect(nested.textContent).toBe('')
    resolve('settled')
    await promise
    flush()
    expect(control.textContent).toBe('settled')
    expect(preloaded.textContent).toBe('settled')
    expect(nested.textContent).toBe('settled')
  } finally {
    dispose()
  }
})

test('a single provider tracks a lazy signal read', () => {
  const scope = context<string>()
  const value = state(0)
  const host = document.createElement('div')
  const dispose = createRoot((end) => {
    insert(host, () => scope.provide('single', () => () => `${scope.use}:${value.value}`))
    return end
  })
  try {
    expect(host.textContent).toBe('single:0')
    value.value++
    flush()
    expect(host.textContent).toBe('single:1')
  } finally {
    dispose()
  }
})

test('a lazy read called within its own provider tracks and cleans up with its effect', () => {
  const scope = context<string>()
  const value = state(0)
  const seen: string[] = []
  const cleaned: number[] = []
  const dispose = createRoot((end) => {
    const child = scope.provide('own', () => () => {
      const n = value.value
      onCleanup(() => cleaned.push(n))
      return `${scope.use}:${n}`
    })
    effect(child, (text) => seen.push(text))
    return end
  })
  value.value++
  flush()
  dispose()
  value.value++
  flush()
  expect(seen).toEqual(['own:0', 'own:1'])
  expect(cleaned).toEqual([0, 1])
})

test('three nested providers keep each lazy array child reactive in its nearest scope', () => {
  const scope = context<string>()
  const parent = context<string>()
  const value = state(0)
  const outside = context('default')
  const host = document.createElement('div')
  const cleaned: number[] = []
  const dispose = createRoot((end) => {
    insert(host, () =>
      parent.provide('parent', () => [
        () => `${parent.use}/${scope.use}|`,
        scope.provide('middle', () => [
          () => `${parent.use}/${scope.use}|`,
          scope.provide('inner', () => () => {
            const n = value.value
            onCleanup(() => cleaned.push(n))
            return `${parent.use}/${scope.use}:${n}`
          }),
        ]),
        () => `|${outside.use}/${scope.use}`,
      ]),
    )
    return end
  })
  try {
    expect(host.textContent).toBe('parent/undefined|parent/middle|parent/inner:0|default/undefined')
    value.value++
    flush()
    expect(host.textContent).toBe('parent/undefined|parent/middle|parent/inner:1|default/undefined')
    expect(cleaned).toEqual([0])
  } finally {
    dispose()
  }
  value.value++
  flush()
  expect(cleaned).toEqual([0, 1])
})

test('a Boundary inside a provider keeps its returned accessor reactive', () => {
  const scope = context<string>()
  const value = state(0)
  const host = document.createElement('div')
  const dispose = createRoot((end) => {
    insert(host, () =>
      scope.provide('outer', () => Boundary({ children: () => `${scope.use}:${value.value}` })),
    )
    return end
  })
  try {
    expect(host.textContent).toBe('outer:0')
    value.value++
    flush()
    expect(host.textContent).toBe('outer:1')
  } finally {
    dispose()
  }
})

test('a nested accessor read inline tracks and cleans up with its caller', () => {
  const scope = context('default')
  const value = state(0)
  const detail = state(0)
  const seen: string[] = []
  const details: string[] = []
  const cleaned: number[] = []
  const dispose = createRoot((end) => {
    const child = scope.provide('outer', () =>
      scope.provide('inner', () => () => {
        const n = value.value
        effect(
          () => `${scope.use}:${detail.value}`,
          (text) => details.push(text),
        )
        onCleanup(() => cleaned.push(n))
        return `${scope.use}:${n}`
      }),
    )
    effect(
      () => {
        const caller = getOwner()
        const text = child()
        expect(getOwner()).toBe(caller)
        return `${text}/${scope.use}`
      },
      (text) => seen.push(text),
    )
    return end
  })
  detail.value++
  flush()
  value.value++
  flush()
  dispose()
  expect(seen).toEqual(['inner:0/default', 'inner:1/default'])
  expect(details).toEqual(['inner:0', 'inner:1', 'inner:1'])
  expect(cleaned).toEqual([0, 1])
})

test('nested provider content hydrates its server-rendered text in place and stays reactive', () => {
  const scope = context<string>()
  const value = state(0)
  const view = () =>
    scope.provide('outer', () => scope.provide('inner', () => () => `${scope.use}:${value.value}`))
  const host = document.createElement('div')
  host.innerHTML = renderToString(view)
  const text = host.firstChild
  expect(text?.textContent).toBe('inner:0')
  const dispose = hydrate(view, host)
  try {
    expect(host.firstChild).toBe(text)
    value.value++
    flush()
    expect(host.firstChild).toBe(text)
    expect(text?.textContent).toBe('inner:1')
  } finally {
    dispose()
  }
})
