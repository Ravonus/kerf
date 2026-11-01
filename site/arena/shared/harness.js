// The same meter in all three frames. It knows nothing about any framework.
export const CELLS = 1000
export const glyph = n => (n & 15).toString(16)

export const count = { renders: 0, runs: 0 }

export function harness(root, { click, tick, runs }) {
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
  window.arena = {
    click: () => timed(click),
    press: () => { timed(click); parent.postMessage({ arena: 'press' }, location.origin) },
    tick: k => timed(() => tick(k)),
    read: () => ({ ...out, renders: count.renders - base.renders, runs: runs() - base.runs }),
  }
  parent.postMessage({ arena: 'ready' }, location.origin)
  return window.arena
}
