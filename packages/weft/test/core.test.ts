import { derived, effect, flush, onCleanup, state, untrack, watch, createRoot, context, getOwner } from '@weft-js/core'

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

test('state.linked with `key`: a refetch of the same row keeps an edit and reports the conflict', () => {
  const row = state({ id: 1, title: 'a' })
  const title = state.linked(() => row.value.title, { key: () => row.value.id })
  expect(title.value).toBe('a')
  row.value = { id: 1, title: 'b' } // no edit yet: follows the source
  expect(title.value).toBe('b')
  expect(title.conflict.value).toBeUndefined()
  title.value = 'mine'
  expect(title.conflict.value).toBeUndefined()
  row.value = { id: 1, title: 'theirs' }
  expect(title.value).toBe('mine')
  expect(title.conflict.value).toEqual({ theirs: 'theirs', base: 'b' })
  title.value = 'mine 2' // the base stays the value the edit started from
  expect(title.conflict.value).toEqual({ theirs: 'theirs', base: 'b' })
  row.value = { id: 2, title: 'other' } // another row: reset
  expect(title.value).toBe('other')
  expect(title.conflict.value).toBeUndefined()
  row.value = { id: 1, title: 'back' } // the first row again: its old edit doesn't come back
  expect(title.value).toBe('back')
})

test('state.linked resets when the source changes back to the value it was written against', () => {
  const prop = state('')
  const local = state.linked(() => prop.value)
  local.value = 'draft'
  prop.value = 'saved'
  expect(local.value).toBe('saved')
  prop.value = '' // e.g. an undo: the source changed, so the old draft must not come back
  expect(local.value).toBe('')
})

test('context.provide: the provided subtree is disposed with its parent', () => {
  const ctx = context(0)
  let cleaned = 0
  createRoot(dispose => {
    ctx.provide(1, () => onCleanup(() => cleaned++))
    dispose()
  })
  expect(cleaned).toBe(1)
})

test('graph memory: per-key sources go with their last reader; effects that read nothing are not kept', () => {
  const selected = state<Record<string, boolean>>({})
  let owner: any
  const dispose = createRoot(d => {
    owner = getOwner()
    for (const k of ['a', 'b']) effect(() => selected.get(k), () => {})
    effect(() => 1, () => {}) // reads nothing: can never re-run
    return d
  })
  expect((selected as any).k.size).toBe(2)
  expect(owner.tail).toBe(owner.owned.sib) // two kept, the one that reads nothing dropped
  dispose()
  expect((selected as any).k.size).toBe(0)
})
