import * as internal from '@kerf/core/internal'
import { collect, createRoot, flush, state } from '@kerf/core'
import * as root from '../src/full'
import manifest from '../package.json'
import * as graph from '../src/index/graph'
import { Box } from '../src/index/state'

const graphNames = [
  'DIRTY',
  'rt',
  'listener',
  'read',
  'reach',
  'clean',
  'setFlat',
  'flat',
  'runMounts',
  'setKeyed',
  'NONE',
  'stats',
  'devComponent',
] as const

test('the internal entry shares runtime objects and box constructors', () => {
  expect(internal.DIRTY).toBe(graph.DIRTY)
  expect(internal.rt).toBe(graph.rt)
  expect(internal.listener).toBe(graph.listener)
  expect(internal.read).toBe(graph.read)
  expect(internal.reach).toBe(graph.reach)
  expect(internal.clean).toBe(graph.clean)
  expect(internal.setFlat).toBe(graph.setFlat)
  expect(internal.flat).toBe(graph.flat)
  expect(internal.runMounts).toBe(graph.runMounts)
  expect(internal.setKeyed).toBe(graph.setKeyed)
  expect(internal.NONE).toBe(graph.NONE)
  expect(internal.stats).toBe(graph.stats)
  expect(internal.devComponent).toBe(graph.devComponent)
  expect(internal.Box).toBe(Box)
  const [box, collected] = collect(() => {
    const collectedBox = state(1)
    expect(internal.collecting).toContain(collectedBox)
    return collectedBox
  })
  expect(box).toBeInstanceOf(internal.Box)
  expect(collected).toEqual([box])
  expect(internal.collecting).toBeNull()
})

test('internal bindings and public state share tracking and disposal', () => {
  const count = state(1)
  const seen: unknown[] = []
  const dispose = createRoot((disposeRoot) => {
    internal.hole(
      () => {
        expect(internal.listener).toBe(graph.listener)
        expect(internal.listener).toBeTruthy()
        return count.value
      },
      (value) => seen.push(value),
    )
    return disposeRoot
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
