// `@kerf-js/veneer-core/kerf`: `use` puts an action on an element from a kerf component, with no @kerf-js/veneer installed.
import { createRoot, flush, state } from '@kerf-js/core'
import { tpl } from '@kerf-js/core/dom'
import { runMounts } from '@kerf-js/core/internal'
import { use } from '../bindings/kerf'

const action = () => {
  const calls: unknown[][] = []
  const make = (el: Element, o: number) => {
    calls.push(['make', el, o])
    return {
      update(n: number) {
        calls.push(['update', n])
      },
      destroy() {
        calls.push(['destroy'])
      },
    }
  }
  return { calls, make }
}

test('makes the action after mount, feeds it new options, destroys it with the owner', async () => {
  const { calls, make } = action()
  const el = document.createElement('div')
  const opts = state(1)
  const dispose = createRoot((d) => {
    use(
      make,
      () => el,
      () => opts.value,
    )
    return d
  })
  expect(calls).toEqual([])
  runMounts()
  await Promise.resolve()
  expect(calls).toEqual([['make', el, 1]])
  opts.value = 2
  flush()
  expect(calls.at(-1)).toEqual(['update', 2])
  dispose()
  expect(calls.at(-1)).toEqual(['destroy'])
})

test('an owner gone before the microtask never makes the action', async () => {
  const { calls, make } = action()
  const dispose = createRoot((d) => {
    use(
      make,
      () => document.createElement('div'),
      () => 1,
    )
    return d
  })
  runMounts()
  dispose()
  await Promise.resolve()
  expect(calls).toEqual([])
})

test('no element, no action', async () => {
  const { calls, make } = action()
  createRoot(() =>
    use(
      make,
      () => undefined,
      () => 1,
    ),
  )
  runMounts()
  await Promise.resolve()
  expect(calls).toEqual([])
})

test('an element cloned from a template gets its action when it is inserted, not before it has a window', async () => {
  const { calls, make } = action()
  // What a compiled component's root is: a clone that belongs to the template's own document until it is inserted.
  const el = tpl('<div></div>')() as Element
  expect(el.ownerDocument.defaultView).toBeNull()
  const windows: unknown[] = []
  const dispose = createRoot((d) => {
    use(
      (node: Element, o: number) => {
        windows.push(node.ownerDocument.defaultView)
        return make(node, o)
      },
      () => el,
      () => 1,
    )
    return d
  })
  runMounts()
  await Promise.resolve()
  expect(calls).toEqual([])
  document.body.append(el)
  await new Promise((ok) => {
    setTimeout(ok)
  })
  expect(calls).toEqual([['make', el, 1]])
  expect(windows).toEqual([window])
  dispose()
  expect(calls.at(-1)).toEqual(['destroy'])
  el.remove()
})

test('an element still waiting when its owner goes never gets its action', async () => {
  const { calls, make } = action()
  const el = tpl('<div></div>')() as Element
  const dispose = createRoot((d) => {
    use(
      make,
      () => el,
      () => 1,
    )
    return d
  })
  runMounts()
  await Promise.resolve()
  dispose()
  document.body.append(el)
  await new Promise((ok) => {
    setTimeout(ok)
  })
  expect(calls).toEqual([])
  el.remove()
})

test('an insertion the page does not report (into a fragment of its document) is found by the recheck', async () => {
  const { calls, make } = action()
  const el = tpl('<div></div>')() as Element
  const dispose = createRoot((d) => {
    use(
      make,
      () => el,
      () => 1,
    )
    return d
  })
  runMounts()
  await Promise.resolve()
  document.createDocumentFragment().append(el)
  await new Promise((ok) => {
    setTimeout(ok, 400)
  })
  expect(calls).toEqual([['make', el, 1]])
  dispose()
})
