// The same meter in all three frames. It knows nothing about any framework.
export const CELLS = 1000
export const glyph = n => (n & 15).toString(16)

export const count = { renders: 0, runs: 0 }

/** One update in this many runs under the observer and isn't timed, so all three frames sample the same updates. */
const SAMPLE = 30
const loaded = performance.now()

export function harness(root, { click, tick, runs }) {
  const created = performance.now() - loaded
  const seen = new MutationObserver(() => {})
  const base = { renders: count.renders, runs: runs() }
  const out = { writes: 0, updates: 0, ms: 0, last: 0 }
  // Run under the observer, which costs time of its own, so what it counts is never timed.
  const counted = fn => {
    seen.observe(root, { subtree: true, childList: true, characterData: true, attributes: true })
    fn()
    const writes = seen.takeRecords().length
    seen.disconnect()
    return writes
  }
  let ticks = 0
  const beat = k => {
    if (++ticks % SAMPLE === 0) {
      out.writes += counted(() => tick(k)) * SAMPLE // stands for the updates between samples
      return
    }
    const start = performance.now()
    tick(k)
    const took = performance.now() - start
    out.updates++
    out.ms += took
    out.last = took
  }
  const press = () => { out.writes += counted(click) } // too few to time: see the page's note
  window.arena = {
    click: press,
    press: () => { press(); parent.postMessage({ arena: 'press' }, location.origin) },
    tick: beat,
    read: () => ({
      ...out,
      renders: count.renders - base.renders,
      runs: runs() - base.runs,
      created, // from this module loading to the app in place
      heap: performance.memory?.usedJSHeapSize, // Chromium only, rounded by the browser; evals/speed has the exact figure
      isolated: crossOriginIsolated, // the 5 microsecond clock; without it the browser rounds to 100 and the sum still holds
    }),
  }
  parent.postMessage({ arena: 'ready' }, location.origin)
  return window.arena
}
