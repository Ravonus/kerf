// `@weft/warp-core/weft`: `use` puts an action on an element from a weft component, with no @weft/warp installed.
import { createRoot, flush, runMounts, state } from 'weft'
import { use } from '../bindings/weft'

const action = () => {
  const calls: unknown[][] = []
  const make = (el: Element, o: number) => {
    calls.push(['make', el, o])
    return { update(n: number) { calls.push(['update', n]) }, destroy() { calls.push(['destroy']) } }
  }
  return { calls, make }
}

test('makes the action after mount, feeds it new options, destroys it with the owner', async () => {
  const { calls, make } = action()
  const el = document.createElement('div')
  const opts = state(1)
  const dispose = createRoot(d => { use(make, () => el, () => opts.value); return d })
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
  const dispose = createRoot(d => { use(make, () => document.createElement('div'), () => 1); return d })
  runMounts()
  dispose()
  await Promise.resolve()
  expect(calls).toEqual([])
})

test('no element, no action', async () => {
  const { calls, make } = action()
  createRoot(() => use(make, () => undefined, () => 1))
  runMounts()
  await Promise.resolve()
  expect(calls).toEqual([])
})
