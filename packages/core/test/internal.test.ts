import * as internal from '@weft-js/core/internal'
import { collect, createRoot, flush, state } from '@weft-js/core'
import * as root from '../src/full'
import manifest from '../package.json'
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
      expect(internal.listener).toBeTruthy()
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

test('the published root excludes compiler and runtime internals', () => {
  expect(manifest.exports['.']).toBe('./src/full.ts')
  expect(manifest.exports['./internal']).toBe('./src/internal.ts')
  for (const name of [...graphNames, 'Box', 'collecting', 'hole', 'localProps', 'restOf']) {
    expect(name in root, name).toBe(false)
    expect(name in internal, name).toBe(true)
  }
  expect(root.memo).toBeTypeOf('function')
  const box = root.state({ value: 1 })
  expect(box).toBeInstanceOf(internal.Box)
  expect(box.get('value')).toBe(1)
})
