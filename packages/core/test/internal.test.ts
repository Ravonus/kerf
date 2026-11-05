import * as internal from '@weft-js/core/internal'
import { collect, createRoot, flush, state } from '@weft-js/core'
import * as graph from '../src/index/graph'
import { Box } from '../src/index/state'

const graphNames = [
  'DIRTY', 'rt', 'listener', 'read', 'reach', 'clean', 'setFlat', 'flat',
  'runMounts', 'setKeyed', 'NONE', 'stats', 'devComponent',
] as const

test('the internal entry shares runtime objects and box constructors', () => {
  for (const name of graphNames) expect(internal[name]).toBe(graph[name])
  expect(internal.Box).toBe(Box)
  const [box, collected] = collect(() => {
    const box = state(1)
    expect(internal.collecting).toContain(box)
    return box
  })
  expect(box).toBeInstanceOf(internal.Box)
  expect(collected).toEqual([box])
  expect(internal.collecting).toBeNull()
})

test('internal bindings and public state share tracking and disposal', () => {
  const count = state(1)
  const seen: unknown[] = []
  const dispose = createRoot((dispose) => {
    internal.hole(() => {
      expect(internal.listener).toBe(graph.listener)
      expect(internal.listener).not.toBeNull()
      return count.value
    }, (value) => seen.push(value))
    return dispose
  })
  try {
    count.value = 2
    flush()
    expect(seen).toEqual([1, 2])
  } finally {
    dispose()
  }
  count.value = 3
  flush()
  expect(seen).toEqual([1, 2])
})
