import { upperMedian as median } from '../../scripts/lib/helpers.mjs'
// The reactive core alone, no DOM: js-reactivity-benchmark's kairo cases, cellx, a dynamic graph, then creation and
// memory. One library per process, so one's JIT state can't touch another's.
//   node --expose-gc reactive.mjs kerf|kerf-base|solid|alien [--rounds 9]
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { getHeapStatistics } from 'node:v8'

const here = dirname(fileURLToPath(import.meta.url))
const lib = process.argv[2]
const rounds = Number(process.argv[process.argv.indexOf('--rounds') + 1]) || 9
const m = await import(pathToFileURL(join(here, 'dist/reactive', `${lib}.mjs`)))

const kerf = () => ({
  signal: (v) => {
    const s = m.state(v)
    return {
      get: () => s.value,
      set: (v) => {
        s.value = v
      },
    }
  },
  computed: (fn) => {
    const d = m.derived(fn)
    return { get: () => d.value }
  },
  effect: (fn) => m.effect(fn, () => {}),
  batch: (fn) => {
    fn()
    m.flush()
  },
  root: (fn) => m.createRoot(fn),
})
const solid = () => ({
  signal: (v) => {
    const [get, set] = m.createSignal(v)
    return { get, set }
  },
  computed: (fn) => ({ get: m.createMemo(fn) }),
  effect: (fn) => m.createEffect(fn),
  batch: (fn) => m.batch(fn),
  root: (fn) => m.createRoot(fn),
})
const alien = () => ({
  signal: (v) => {
    const s = m.signal(v)
    return { get: () => s(), set: (v) => s(v) }
  },
  computed: (fn) => ({ get: m.computed(fn) }),
  effect: (fn) => m.effect(fn),
  batch: (fn) => {
    m.startBatch()
    fn()
    m.endBatch()
  },
  root: (fn) => fn(() => {}),
})
const r = lib === 'solid' ? solid() : lib === 'alien' ? alien() : kerf()
const { signal, computed, effect, batch, root } = r
const assert = (ok, what) => {
  if (!ok) throw new Error(`${lib}: ${what}`)
}

// ---- kairo (js-reactivity-benchmark), the same graphs and counts --------------------------------------------------

const busy = () => {
  let a = 0
  for (let i = 0; i < 100; i++) a++
  return a
}

function avoidable() {
  const head = signal(0)
  const c1 = computed(() => head.get())
  const c2 = computed(() => (c1.get(), 0))
  const c3 = computed(() => (busy(), c2.get() + 1))
  const c4 = computed(() => c3.get() + 2)
  const c5 = computed(() => c4.get() + 3)
  let runs = 0
  effect(() => {
    c5.get()
    busy()
    runs++
  })
  return () => {
    for (let i = 0; i < 1000; i++) batch(() => head.set(i + 1))
    assert(c5.get() === 6, 'avoidable')
  }
}

function broad() {
  const head = signal(0)
  let last = head,
    runs = { n: 0 }
  for (let i = 0; i < 50; i++) {
    const c = computed(() => head.get() + i)
    const c2 = computed(() => c.get() + 1)
    effect(() => {
      c2.get()
      runs.n++
    })
    last = c2
  }
  return () => {
    for (let i = 0; i < 50; i++) batch(() => head.set(i))
    assert(last.get() === 49 + 50, 'broad')
  }
}

function deep() {
  const head = signal(0)
  let cur = head
  for (let i = 0; i < 50; i++) {
    const prev = cur
    cur = computed(() => prev.get() + 1)
  }
  const last = cur
  effect(() => {
    last.get()
  })
  return () => {
    for (let i = 0; i < 50; i++) batch(() => head.set(i))
    assert(last.get() === 99, 'deep')
  }
}

function diamond() {
  const head = signal(0)
  const branches = []
  for (let i = 0; i < 5; i++) branches.push(computed(() => head.get() + 1))
  const sum = computed(() => branches.reduce((a, b) => a + b.get(), 0))
  effect(() => {
    sum.get()
  })
  return () => {
    for (let i = 0; i < 500; i++) batch(() => head.set(i))
    assert(sum.get() === 5 * 500, 'diamond')
  }
}

function mux() {
  const heads = Array.from({ length: 100 }, () => signal(0))
  const all = computed(() => heads.map((h) => h.get()))
  const split = heads
    .map((_, i) => computed(() => all.get()[i]))
    .map((c) => computed(() => c.get() + 1))
  for (const c of split)
    effect(() => {
      c.get()
    })
  return () => {
    for (let i = 0; i < 10; i++) batch(() => heads[i].set(i + 1))
    assert(split[3].get() >= 1, 'mux')
    for (let i = 0; i < 10; i++) batch(() => heads[i].set(0))
  }
}

function repeated() {
  const head = signal(0)
  const cur = computed(() => {
    let out = 0
    for (let i = 0; i < 30; i++) out += head.get()
    return out
  })
  effect(() => {
    cur.get()
  })
  return () => {
    for (let i = 0; i < 100; i++) batch(() => head.set(i))
    assert(cur.get() === 99 * 30, 'repeated')
  }
}

function triangle() {
  const head = signal(0)
  let cur = head
  const list = []
  for (let i = 0; i < 10; i++) {
    const prev = cur
    list.push(prev)
    cur = computed(() => prev.get() + 1)
  }
  const sum = computed(() => list.reduce((a, b) => a + b.get(), 0))
  effect(() => {
    sum.get()
  })
  return () => {
    for (let i = 0; i < 100; i++) batch(() => head.set(i))
    assert(sum.get() >= 0, 'triangle')
  }
}

function unstable() {
  const head = signal(0)
  const double = computed(() => head.get() * 2)
  const inverse = computed(() => -head.get())
  const cur = computed(() => {
    let out = 0
    for (let i = 0; i < 20; i++) out += i % 2 ? (head.get() % 2 ? double.get() : inverse.get()) : 0
    return out
  })
  effect(() => {
    cur.get()
  })
  return () => {
    for (let i = 0; i < 100; i++) batch(() => head.set(i))
    assert(typeof cur.get() === 'number', 'unstable')
  }
}

// ---- cellx: layers of four cells, each depending on two of the layer above ----------------------------------------

function cellx(layers) {
  return () => {
    const start = { a: signal(1), b: signal(2), c: signal(3), d: signal(4) }
    let prev = start
    const first = start
    root(() => {
      for (let i = layers; i--;) {
        const p = prev
        const next = {
          a: computed(() => p.b.get()),
          b: computed(() => p.a.get() - p.c.get()),
          c: computed(() => p.b.get() + p.d.get()),
          d: computed(() => p.c.get()),
        }
        effect(() => {
          next.a.get()
        })
        effect(() => {
          next.b.get()
        })
        effect(() => {
          next.c.get()
        })
        effect(() => {
          next.d.get()
        })
        prev = next
      }
    })
    const end = prev
    batch(() => {
      first.a.set(4)
      first.b.set(3)
      first.c.set(2)
      first.d.set(1)
    })
    return [end.a.get(), end.b.get(), end.c.get(), end.d.get()]
  }
}

// ---- a graph whose edges move: Reactively's dynamic test ----------------------------------------------------------

function dynamic({ width, layers, sources, staticShare, readShare }) {
  let seed = 12345
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const heads = Array.from({ length: width }, (_, i) => signal(i))
  let layer = heads
  for (let l = 0; l < layers; l++) {
    const above = layer
    layer = above.map((_, i) => {
      const picks = Array.from({ length: sources }, (_, k) => above[(i + k) % width])
      if (rnd() < staticShare) return computed(() => picks.reduce((a, b) => a + b.get(), 0) % 1000)
      return computed(() => {
        // each run takes a different one of the picks away
        const skip = picks[0].get() % sources
        let sum = 0
        for (let k = 0; k < sources; k++) if (k !== skip) sum += picks[k].get()
        return sum % 1000
      })
    })
  }
  const leaves = layer
  let sum = 0
  return () => {
    for (let i = 0; i < 100; i++) {
      batch(() => heads[i % width].set(heads[i % width].get() + 1))
      for (let k = 0; k < width; k += 4) sum += leaves[k].get()
    }
    return sum
  }
}

// ---- running -------------------------------------------------------------------------------------------------------

function timed(setup, ms = 120) {
  const run = root(setup)
  const out = []
  for (let i = 0; i < rounds; i++) {
    globalThis.gc?.()
    const t = performance.now()
    let n = 0
    do {
      run()
      n++
    } while (performance.now() - t < ms)
    out.push((performance.now() - t) / n)
  }
  return median(out.slice(2))
}

const results = {}
for (const [name, setup] of Object.entries({
  avoidable,
  broad,
  deep,
  diamond,
  mux,
  repeated,
  triangle,
  unstable,
}))
  results[name] = timed(setup)
results['cellx 1000'] = timed(() => cellx(1000))
results['dynamic (small, half static)'] = timed(() =>
  dynamic({ width: 10, layers: 5, sources: 2, staticShare: 0.5 }),
)
results['dynamic (wide, mostly static)'] = timed(() =>
  dynamic({ width: 100, layers: 5, sources: 3, staticShare: 0.9 }),
)

let kept // what's measured stays reachable
function creation(n) {
  const out = {}
  const measure = (name, make) => {
    const times = [],
      heaps = []
    for (let i = 0; i < 7; i++) {
      globalThis.gc?.()
      const before = getHeapStatistics().used_heap_size
      const t = performance.now()
      const keep = root(make)
      times.push(performance.now() - t)
      globalThis.gc?.()
      heaps.push((getHeapStatistics().used_heap_size - before) / n)
      kept = keep
    }
    out[name] = { nsEach: (median(times.slice(2)) / n) * 1e6, bytesEach: median(heaps.slice(2)) }
  }
  measure('signal', () => Array.from({ length: n }, (_, i) => signal(i)))
  measure('computed, one source, read', () => {
    const list = Array.from({ length: n }, (_, i) => {
      const s = signal(i)
      const c = computed(() => s.get())
      c.get()
      return c
    })
    return list
  })
  measure('effect, one source', () =>
    Array.from({ length: n }, (_, i) => {
      const s = signal(i)
      effect(() => {
        s.get()
      })
      return s
    }),
  )
  return out
}

console.log(JSON.stringify({ lib, ms: results, creation: creation(100_000) }))
