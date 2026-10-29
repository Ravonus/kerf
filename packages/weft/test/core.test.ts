import { derived, effect, flush, onCleanup, state, untrack, watch, createRoot } from 'weft'

test('reads are consistent straight after a write', () => {
  const a = state(1)
  const b = derived(() => a.value * 2)
  expect(b.value).toBe(2)
  a.value = 5
  expect(b.value).toBe(10)
})

test('derived is lazy and cached', () => {
  let runs = 0
  const a = state(1)
  const b = derived(() => (runs++, a.value + 1))
  expect(runs).toBe(0)
  b.value; b.value
  expect(runs).toBe(1)
})

test('effects batch to a microtask and flush() applies them now', async () => {
  const a = state(0)
  const seen: number[] = []
  createRoot(() => effect(() => a.value, v => seen.push(v)))
  a.value = 1
  a.value = 2
  expect(seen).toEqual([0])
  flush()
  expect(seen).toEqual([0, 2])
  a.value = 3
  await Promise.resolve()
  expect(seen).toEqual([0, 2, 3])
})

test('no glitches: a diamond settles once with consistent values', () => {
  const a = state(1)
  const b = derived(() => a.value + 1)
  const c = derived(() => a.value * 10)
  const seen: string[] = []
  createRoot(() => effect(() => `${b.value}/${c.value}`, v => seen.push(v)))
  a.value = 2
  flush()
  expect(seen).toEqual(['2/10', '3/20'])
})

test('equal writes notify nobody', () => {
  const a = state('x')
  let runs = 0
  createRoot(() => effect(() => a.value, () => runs++))
  a.value = 'x'
  flush()
  expect(runs).toBe(1)
})

test('watch tracks its source only and cleans up on re-run and dispose', () => {
  const a = state(1)
  const other = state(0)
  const log: string[] = []
  const dispose = createRoot(d => {
    watch(() => a.value, v => {
      other.value // untracked
      log.push(`run ${v}`)
      return () => log.push(`cleanup ${v}`)
    })
    return d
  })
  other.value = 1
  flush()
  a.value = 2
  flush()
  dispose()
  expect(log).toEqual(['run 1', 'cleanup 1', 'run 2', 'cleanup 2'])
})

test('untrack reads without subscribing', () => {
  const a = state(1)
  let runs = 0
  createRoot(() => effect(() => untrack(() => a.value), () => runs++))
  a.value = 2
  flush()
  expect(runs).toBe(1)
})

test('disposing a root stops its effects', () => {
  const a = state(1)
  let runs = 0
  const dispose = createRoot(d => (effect(() => a.value, () => runs++), onCleanup(() => {}), d))
  dispose()
  a.value = 2
  flush()
  expect(runs).toBe(1)
})

test('set() updates a copy so identity changes', () => {
  const xs = state([1, 2])
  const before = xs.value
  xs.set(d => { d.push(3) })
  expect(xs.value).toEqual([1, 2, 3])
  expect(xs.value).not.toBe(before)
})

test('state.linked follows its source until written, then resets when the source changes', () => {
  const prop = state('a')
  const local = state.linked(() => prop.value)
  expect(local.value).toBe('a')
  local.value = 'edited'
  expect(local.value).toBe('edited')
  prop.value = 'b'
  expect(local.value).toBe('b')
})
