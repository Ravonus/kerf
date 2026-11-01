// The same meter in all three frames. It knows nothing about any framework.
export const CELLS = 1000
export const glyph = n => (n & 15).toString(16)

export const count = { renders: 0, runs: 0 }

/** Ticks that run together now and then, in all three frames alike, so they stay in step. */
const BLOCK = 32
const EVERY = 30
const loaded = performance.now()

export function harness(root, { click, tick, runs }) {
  const created = performance.now() - loaded
  const seen = new MutationObserver(() => {})
  seen.observe(root, { subtree: true, childList: true, characterData: true, attributes: true })
  seen.takeRecords()
  const base = { renders: count.renders, runs: runs() }
  const out = { writes: 0, updates: 0, ms: 0, last: 0 }
  const timed = fn => {
    const start = performance.now()
    fn()
    const took = performance.now() - start
    out.writes += seen.takeRecords().length
    out.updates++
    out.ms += took
    out.last = took
  }
  // A browser's clock here moves in steps of 100 microseconds or more, and one update is often shorter than a step, so
  // timing updates one by one shows the step. A block of them is long enough to read. Its work isn't what the page
  // shows, so it counts toward time only: not toward page changes, components re-run or small updates.
  const block = { ms: 0, updates: 0, ticks: 0 }
  const measure = k => {
    const renders = count.renders, ran = runs()
    const start = performance.now()
    for (let i = 1; i <= BLOCK; i++) tick(k + i)
    block.ms += performance.now() - start
    block.updates += BLOCK
    seen.takeRecords()
    base.renders += count.renders - renders
    base.runs += runs() - ran
  }
  window.arena = {
    click: () => timed(click),
    press: () => { timed(click); parent.postMessage({ arena: 'press' }, location.origin) },
    tick: k => {
      timed(() => tick(k))
      if (++block.ticks % EVERY === 0) measure(k)
    },
    read: () => ({
      ...out,
      ms: block.updates ? block.ms / block.updates * out.updates : out.ms,
      renders: count.renders - base.renders,
      runs: runs() - base.runs,
      created, // from this module loading to the app in place
      heap: performance.memory?.usedJSHeapSize, // Chromium only, rounded by the browser; evals/speed has the exact figure
    }),
  }
  parent.postMessage({ arena: 'ready' }, location.origin)
  return window.arena
}
