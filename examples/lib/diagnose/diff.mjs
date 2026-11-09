import { METRICS, compare } from '../stats.mjs'

const driftFor = (run, prev, controls) => (path, key) => {
  if (METRICS[key].unit !== 'ms') return 1
  const r = controls
    .map((n) => [
      run.variants[n].pages[path]?.metrics[key]?.med,
      prev.variants[n].pages?.[path]?.[key]?.med,
    ])
    .filter(([a, b]) => a && b)
    .map(([a, b]) => a / b)
    .sort((a, b) => a - b)
  return r.length ? r[r.length >> 1] : 1
}

function movement(key, now, old, d) {
  // Drift only ever removes a claim: a move has to hold both as measured and net of the controls.
  const c = compare(key, now, { ...old, med: old.med * d, min: old.min * d, max: old.max * d }),
    raw = compare(key, now, old)
  if (!c || c.verdict === 'tie' || c.verdict !== raw.verdict) return null
  return { delta: raw.delta, verdict: c.verdict === 'win' ? 'better' : 'worse' }
}

/**
 * Metric medians that moved between two runs, past what either run's own spread explains. A variant whose build key didn't
 * change can't have really moved, so it isn't reported: it's the control, and how far the controls drifted on a timing metric
 * is taken off the variants that did change before they're judged.
 */
export function diffRuns(run, prev) {
  const changed = Object.keys(run.variants).filter(
      (n) => prev.variants[n] && prev.variants[n].key !== run.variants[n].key,
    ),
    controls = Object.keys(run.variants).filter((n) => prev.variants[n] && !changed.includes(n))
  const drift = driftFor(run, prev, controls)
  const moved = []
  for (const name of changed)
    for (const [path, page] of Object.entries(run.variants[name].pages))
      for (const [key, now] of Object.entries(page.metrics)) {
        const old = prev.variants[name]?.pages?.[path]?.[key]
        if (!old || !now) continue
        const m = movement(key, now, old, drift(path, key))
        if (m) moved.push({ variant: name, page: path, key, was: old, now, ...m })
      }
  return { changed, controls, moved }
}
