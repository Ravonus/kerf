// The point of the benchmark: per weft variant, what cost it score and bytes, how far it is from the best other variant, what
// moved since the last run of this app, and a ranked list of what to tune.
import { METRICS, compare } from './stats.mjs'
import { diffRuns } from './diagnose/diff.mjs'
import { tuneFor } from './diagnose/tune.mjs'

export { report } from './diagnose/report.mjs'

const GAPS = [
  'mobile.score',
  'mobile.lcp',
  'mobile.fcp',
  'mobile.tbt',
  'mobile.si',
  'desktop.score',
  'throttled.lcp',
  'bytes.js.br',
  'bytes.css.br',
  'bytes.html.br',
  'bytes.font.br',
  'browser.hydrate',
  'browser.script',
  'browser.heap',
  'browser.nodes',
  'browser.comments',
  'server.rps',
  'server.rpsPlain',
  'server.p95',
]

/** The best other variant on one metric, by median, and whether the spread backs the gap. */
function gapAgainstBest(run, name, path, key) {
  const mine = run.variants[name].pages[path].metrics[key]
  if (!mine) return null
  const rivals = Object.entries(run.variants).filter(
    ([k, r]) => k !== name && r.pages[path]?.metrics[key],
  )
  if (!rivals.length) return null
  const low = METRICS[key].better === 'low'
  const [best, r] = rivals.reduce((a, b) =>
    (
      low
        ? b[1].pages[path].metrics[key].med < a[1].pages[path].metrics[key].med
        : b[1].pages[path].metrics[key].med > a[1].pages[path].metrics[key].med
    )
      ? b
      : a,
  )
  const theirs = r.pages[path].metrics[key],
    c = compare(key, mine, theirs)
  return { key, best, mine, theirs, delta: c.delta, verdict: c.verdict }
}

export function diagnose(run, prev) {
  const weft = Object.entries(run.variants)
    .filter(([, v]) => v.family === 'weft')
    .map(([k]) => k)
  const out = {
    diff: prev ? { since: prev.at, commit: prev.commit, ...diffRuns(run, prev) } : null,
    variants: {},
    tune: [],
  }
  for (const name of weft) {
    const gaps = {}
    for (const path of Object.keys(run.variants[name].pages))
      gaps[path] = GAPS.map((k) => gapAgainstBest(run, name, path, k))
        .filter(Boolean)
        .map(({ key, best, mine, theirs, delta, verdict }) => ({
          key,
          best,
          mine: mine.med,
          theirs: theirs.med,
          delta,
          verdict,
        }))
    out.variants[name] = { gaps }
    out.tune.push(...tuneFor(run, name, GAPS, gapAgainstBest))
  }
  out.tune.sort((a, b) => b.impact - a.impact)
  return out
}
