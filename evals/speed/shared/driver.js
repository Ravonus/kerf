// The same driver in every stack's page. It knows nothing about any framework: a stack gives it `grid` and `rows`
// functions, and it times them. Only numbers from `measure.mjs` count: it runs this cross-origin isolated, so
// performance.now() is 5 microseconds here where the site's arena gets 100.
export const glyph = n => (n & 15).toString(16)
export const query = new URLSearchParams(location.search)

const place = () => {
  const root = document.createElement('div')
  document.body.append(root)
  return root
}

export function expose(stack) {
  const median = list => [...list].sort((a, b) => a - b)[list.length >> 1]

  /** One timed step: the script, then the same plus the style and layout it left to do. */
  const timed = fn => {
    const start = performance.now()
    fn()
    const script = performance.now() - start
    document.body.offsetHeight
    return [script, performance.now() - start]
  }
  const gc = () => globalThis.gc?.()

  /** A list of 8 rotated: small lists are most lists. Ms per 1,000 rotations; too short to time one at a time. */
  const small = (r, samples) => {
    r.few()
    const script = []
    for (let i = 0; i < samples; i++) {
      gc()
      const start = performance.now()
      for (let j = 0; j < 1000; j++) r.rotate()
      script.push(performance.now() - start)
    }
    r.clear()
    return { script: median(script.slice(samples >> 1)), total: median(script.slice(samples >> 1)) }
  }

  window.speed = {
    /** Mounts `n` cells, once, in a fresh page: V8 hasn't seen this code run yet, as for a real first render. */
    create(n) {
      const root = place()
      const [script, total] = timed(() => stack.grid.mount(n, root))
      return { script, total, dom: root.querySelectorAll('*').length }
    },
    mount(n) { stack.grid.mount(n, place()) },
    unmountTimed() {
      const start = performance.now()
      stack.grid.unmount()
      return performance.now() - start
    },
    /**
     * Updates in a block long enough that the timer can't be the limit. `step` picks the cells: 10 is every 10th, as
     * in the arena. Returns ms per tick, over several samples.
     */
    ticks(n, step, { warm = 200, samples = 15, ms = 150 } = {}) {
      let t = 0
      for (let i = 0; i < warm; i++) stack.grid.tick(t++, step)
      const out = []
      for (let s = 0; s < samples; s++) {
        gc()
        const start = performance.now()
        let done = 0, took = 0
        do {
          for (let i = 0; i < 8; i++) stack.grid.tick(t++, step)
          done += 8
          took = performance.now() - start
        } while (took < ms)
        out.push(took / done)
      }
      return { perTick: median(out), best: Math.min(...out), text: stack.grid.check() }
    },

    /** js-framework-benchmark's operations, on the 1,000 rows it uses (10,000 for `runLots`). */
    rows(name, { warm = 5, samples = 15 } = {}) {
      const r = stack.rows
      if (name === 'small') return r.rotate ? small(r, warm + samples) : null
      const pick = () => [...document.querySelectorAll('tbody tr')]
      const before = {
        create: () => r.clear(), replace: () => r.run(), update: () => r.run(), select: () => r.run(),
        swap: () => r.run(), remove: () => r.run(), runLots: () => r.clear(), append: () => r.run(), clear: () => r.run(),
      }[name]
      const step = {
        create: () => r.run(), replace: () => r.run(), update: () => r.update(), select: k => r.select(k % 1000),
        swap: () => r.swap(), remove: () => r.remove(4), runLots: () => r.runLots(), append: () => r.add(), clear: () => r.clear(),
      }[name]
      // Too short for the timer one at a time: the same step, several times over, per sample.
      const block = { select: 50, update: 10, swap: 20, remove: 20 }[name] ?? 1
      const again = name === 'select' || name === 'update' || name === 'swap' // these leave the page ready to repeat
      const script = [], total = []
      if (again) before()
      for (let i = 0; i < warm + samples; i++) {
        if (!again) before()
        document.body.offsetHeight
        gc()
        const [s, t] = timed(() => { for (let j = 0; j < block; j++) step(i * block + j) })
        if (i >= warm) script.push(s / block), total.push(t / block)
      }
      const shown = pick().length
      r.clear()
      return { script: median(script), total: median(total), shown }
    },
    /** Live rows, for the memory step. */
    run: () => stack.rows.run(),
    clear: () => stack.rows.clear(),
    stack,
  }
  stack.rows?.setup?.(place())
}
