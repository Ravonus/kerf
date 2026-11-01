// Runs keep their links when they read the same things: what must hold when they don't.
import { Box, createRoot, derived, effect, flush, onCleanup, state, stats } from 'weft'

const readers = (box: unknown) => (box as Box<unknown>).o.length

test('a conditional read follows the branch taken, in both directions', () => {
  const on = state(true), a = state(1), b = state(2)
  let runs = 0
  const seen: number[] = []
  createRoot(() => effect(() => (runs++, on.value ? a.value : b.value), v => seen.push(v)))
  expect([readers(a), readers(b)]).toEqual([1, 0])
  on.value = false
  flush()
  expect([readers(a), readers(b)]).toEqual([0, 1])
  a.value = 10 // not read any more
  flush()
  expect(runs).toBe(2)
  b.value = 20
  flush()
  on.value = true
  flush()
  a.value = 11
  flush()
  expect(seen).toEqual([1, 2, 20, 10, 11])
  expect([readers(a), readers(b)]).toEqual([1, 0])
})

test('sources read later than the first change are dropped, however many there were', () => {
  const n = state(4)
  const list = Array.from({ length: 12 }, (_, i) => state(i))
  let runs = 0
  createRoot(() => effect(() => { runs++; let sum = 0; for (let i = 0; i < n.value; i++) sum += list[i].value; return sum }, () => {}))
  expect(list.map(readers).filter(Boolean)).toHaveLength(4)
  n.value = 2
  flush()
  expect(list.map(readers)).toEqual([1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  list[3].value = 99
  flush()
  expect(runs).toBe(2)
  n.value = 12
  flush()
  expect(list.map(readers)).toEqual(new Array(12).fill(1))
  n.value = 0
  flush()
  expect(list.map(readers)).toEqual(new Array(12).fill(0))
})

test('a change of read order keeps every link once and sees every write', () => {
  const flip = state(false), a = state(1), b = state(2), c = state(3)
  const seen: string[] = []
  createRoot(() => effect(() => (flip.value ? [c.value, b.value, a.value] : [a.value, b.value, c.value]).join(), v => seen.push(v)))
  flip.value = true
  flush()
  expect([readers(a), readers(b), readers(c), readers(flip)]).toEqual([1, 1, 1, 1])
  a.value = 7
  flush()
  c.value = 9
  flush()
  expect(seen).toEqual(['1,2,3', '3,2,1', '3,2,7', '9,2,7'])
})

test('reading one box many times is one link, whatever is read between, and every shape of it still updates', () => {
  const a = state(1), b = state(2), twice = state(true)
  const seen: number[] = []
  createRoot(() => effect(() => a.value + a.value + b.value + (twice.value ? a.value : 0), v => seen.push(v)))
  a.value = 2
  flush()
  twice.value = false
  flush()
  a.value = 3
  flush()
  expect(seen).toEqual([5, 8, 6, 8])
  expect(readers(a)).toBe(1)
})

test('a derived whose source changes mid-graph stays glitch-free', () => {
  const pick = state(0)
  const a = state(1), b = state(10)
  const left = derived(() => a.value + 1)
  const right = derived(() => b.value + 1)
  const chosen = derived(() => (pick.value ? right.value : left.value))
  const seen: string[] = []
  createRoot(() => effect(() => `${pick.value}:${chosen.value}`, v => seen.push(v)))
  pick.value = 1
  a.value = 2 // `left` is on the way out: nothing may run on its old value
  flush()
  b.value = 20
  flush()
  expect(seen).toEqual(['0:2', '1:11', '1:21'])
})

test('a derived that lost its last reader and gained a new one is recomputed from fresh sources', () => {
  const on = state(true), a = state(1)
  let inner = 0
  const d = derived(() => (inner++, a.value * 2))
  const seen: number[] = []
  createRoot(() => effect(() => (on.value ? d.value : -1), v => seen.push(v)))
  on.value = false
  flush()
  a.value = 2
  flush()
  on.value = true
  flush()
  expect(seen).toEqual([2, -1, 4])
  expect(inner).toBe(2)
})

test('a run that throws keeps the links of what it read before the throw', () => {
  const a = state(0), b = state(1), c = state(2)
  createRoot(() => effect(() => {
    if (a.value === 1) throw new Error('no')
    return b.value + c.value
  }, () => {}))
  a.value = 1
  expect(() => flush()).toThrow('no')
  expect([readers(a), readers(b), readers(c)]).toEqual([1, 0, 0])
})

test('a child created during a run keeps its own links apart from its parent\'s', () => {
  const a = state(1), b = state(2), c = state(3)
  const seen: string[] = []
  createRoot(() => effect(() => {
    const x = a.value
    effect(() => b.value, v => seen.push(`child ${x}/${v}`))
    return x + c.value // read after the child ran
  }, v => seen.push(`parent ${v}`)))
  expect([readers(a), readers(b), readers(c)]).toEqual([1, 1, 1])
  a.value = 5
  flush()
  expect([readers(a), readers(b), readers(c)]).toEqual([1, 1, 1])
  b.value = 6
  flush()
  expect(seen).toEqual(['child 1/2', 'parent 4', 'child 5/2', 'parent 8', 'child 5/6'])
})

test('a write during a run is seen by the rest of it, and a source written before it is read is fresh', () => {
  const a = state(1), b = state(1)
  const seen: number[] = []
  createRoot(() => effect(() => { b.value = a.value * 2; return b.value }, v => seen.push(v)))
  a.value = 2
  flush()
  expect(seen).toEqual([2, 4])
})

test('disposing a node mid-flush: a queued binding that goes with its parent does not run', () => {
  const a = state(0)
  const seen: string[] = []
  let drop!: () => void
  createRoot(dispose => {
    effect(() => a.value, v => { seen.push(`first ${v}`); if (v === 1) drop() })
    createRoot(d => {
      drop = d
      effect(() => a.value, v => seen.push(`second ${v}`))
    })
    return dispose
  })
  a.value = 1
  flush()
  a.value = 2
  flush()
  expect(seen).toEqual(['first 0', 'second 0', 'first 1', 'first 2'])
  expect(readers(a)).toBe(1)
})

test('a node disposed by its own run stays disposed', () => {
  const a = state(0)
  let runs = 0
  createRoot(dispose => effect(() => { runs++; if (a.value === 1) dispose(); return a.value }, () => {}))
  a.value = 1
  flush()
  a.value = 2
  flush()
  expect(runs).toBe(2)
})

test('a disposed derived keeps its value and stops computing', () => {
  const a = state(1)
  let runs = 0
  let d!: { value: number }
  createRoot(dispose => {
    d = derived(() => (runs++, a.value))
    d.value
    dispose()
  })
  a.value = 2
  expect(d.value).toBe(1)
  expect(runs).toBe(1)
})

test('parents run before children when the write that reaches them comes in the other order', () => {
  const late = state(0), early = state(0)
  const seen: string[] = []
  createRoot(() => {
    effect(() => early.value, v => seen.push(`first ${v}`))
    effect(() => late.value, v => seen.push(`second ${v}`))
  })
  late.value = 1
  early.value = 1
  flush()
  expect(seen).toEqual(['first 0', 'second 0', 'first 1', 'second 1'])
})

test('a child is disposed before it would re-run when its parent re-runs in the same flush', () => {
  const a = state(0)
  const seen: string[] = []
  createRoot(() => effect(() => {
    const x = a.value
    effect(() => a.value, v => seen.push(`child of ${x}: ${v}`))
    onCleanup(() => seen.push(`cleanup ${x}`))
    return x
  }, () => {}))
  a.value = 1
  flush()
  expect(seen).toEqual(['child of 0: 0', 'cleanup 0', 'child of 1: 1'])
})

test('per-key reads: a run that stops reading a key leaves no source behind, and one that returns gets a live one', () => {
  const box = state<Record<string, number>>({ a: 1, b: 2 })
  const key = state('a')
  const seen: (number | undefined)[] = []
  createRoot(() => effect(() => box.get(key.value), v => seen.push(v)))
  key.value = 'b'
  flush()
  expect([...(box as any).k.keys()]).toEqual(['b'])
  key.value = 'a'
  flush()
  box.value = { a: 9, b: 2 }
  flush()
  expect(seen).toEqual([1, 2, 1, 9])
})

test('stats.runs counts re-runs, as it always has: not first runs, not checks that find nothing changed', () => {
  const a = state(1)
  const even = derived(() => a.value % 2 === 0)
  createRoot(() => effect(() => even.value, () => {}))
  const at = stats.runs
  a.value = 3 // `even` re-runs and stays false; the effect doesn't
  flush()
  expect(stats.runs - at).toBe(1)
  a.value = 4
  flush()
  expect(stats.runs - at).toBe(3)
})

test('a flush by hand leaves the scheduled one harmless, and later writes still flush on their own', async () => {
  const a = state(0)
  const seen: number[] = []
  createRoot(() => effect(() => a.value, v => seen.push(v)))
  a.value = 1
  flush()
  a.value = 2
  await Promise.resolve()
  expect(seen).toEqual([0, 1, 2])
  a.value = 3
  await Promise.resolve()
  expect(seen).toEqual([0, 1, 2, 3])
})
