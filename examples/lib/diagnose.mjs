// The point of the benchmark: per weft variant, what cost it score and bytes, how far it is from the best other variant, what
// moved since the last run of this app, and a ranked list of what to tune.
import { METRICS, SITE_METRICS, compare, fmt } from './stats.mjs'
import { tuneFor } from './diagnose/tune.mjs'

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

/**
 * Metric medians that moved between two runs, past what either run's own spread explains. A variant whose build key didn't
 * change can't have really moved, so it isn't reported: it's the control, and how far the controls drifted on a timing metric
 * is taken off the variants that did change before they're judged.
 */
function diffRuns(run, prev) {
  const changed = Object.keys(run.variants).filter(
      (n) => prev.variants[n] && prev.variants[n].key !== run.variants[n].key,
    ),
    controls = Object.keys(run.variants).filter((n) => prev.variants[n] && !changed.includes(n))
  const drift = (path, key) => {
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
  const moved = []
  for (const name of changed)
    for (const [path, page] of Object.entries(run.variants[name].pages))
      for (const [key, now] of Object.entries(page.metrics)) {
        const old = prev.variants[name]?.pages?.[path]?.[key],
          d = drift(path, key)
        if (!old || !now) continue
        // Drift only ever removes a claim: a move has to hold both as measured and net of the controls.
        const c = compare(key, now, {
            ...old,
            med: old.med * d,
            min: old.min * d,
            max: old.max * d,
          }),
          raw = compare(key, now, old)
        if (c && c.verdict !== 'tie' && c.verdict === raw.verdict)
          moved.push({
            variant: name,
            page: path,
            key,
            was: old,
            now,
            delta: raw.delta,
            verdict: c.verdict === 'win' ? 'better' : 'worse',
          })
      }
  return { changed, controls, moved }
}

const pct = (n, of) => `${Math.round((100 * n) / of)}%`
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

const MAIN = [
  'mobile.score',
  'mobile.lcp',
  'throttled.lcp',
  'mobile.tbt',
  'mobile.cls',
  'desktop.score',
  'desktop.lcp',
  'bytes.js.br',
  'bytes.css.br',
  'bytes.html.br',
  'bytes.font.br',
  'browser.hydrate',
  'browser.heap',
  'browser.nodes',
  'server.rps',
  'server.rpsPlain',
  'server.p95',
]
const cell = (k, s) =>
  s
    ? k.startsWith('bytes.') || s.max === s.min
      ? fmt(k, s)
      : `${fmt(k, s)} [${fmt(k, { med: s.min })}–${fmt(k, { med: s.max })}]`
    : '–'

/** The run as markdown, for the terminal. */
export function report(run) {
  const names = Object.keys(run.variants),
    out = [
      `\n## ${run.label}, ${run.commit}${run.dirty ? ' (dirty)' : ''}, ${run.runs} runs, peak load ${run.loadMax?.toFixed(1)}\n`,
    ]
  // A race failure outranks any millisecond, so it comes first.
  const races = [...new Set(names.flatMap((n) => Object.keys(run.variants[n].race ?? {})))]
  if (races.length) {
    out.push(
      '### Races (final DOM equals the database)\n',
      `| | ${names.map((n) => run.variants[n].label).join(' | ')} |`,
      `|---|${names.map(() => '---').join('|')}|`,
    )
    for (const r of races)
      out.push(
        `| ${r} | ${names
          .map((n) => {
            const x = run.variants[n].race?.[r]
            return x ? `${x.pass ? 'pass' : 'FAIL'} ${x.passes}/${x.of}` : '–'
          })
          .join(' | ')} |`,
      )
    out.push('')
  }
  reportPages(run, names, out)
  out.push(
    `| Build / lines | ${names.map((n) => `${(run.variants[n].build.med / 1000).toFixed(1)}s / ${run.variants[n].lines}`).join(' | ')} |\n`,
  )
  for (const [name, d] of Object.entries(run.diagnosis.variants))
    for (const [path, gaps] of Object.entries(d.gaps)) {
      const wins = gaps.filter((g) => g.verdict === 'win').map((g) => METRICS[g.key].label),
        losses = gaps.filter((g) => g.verdict === 'loss').map((g) => METRICS[g.key].label),
        ties = gaps.filter((g) => g.verdict === 'tie').map((g) => METRICS[g.key].label)
      out.push(
        `${name} ${path} against the best other: ahead on ${wins.join(', ') || 'nothing'}; behind on ${losses.join(', ') || 'nothing'}; within spread on ${ties.join(', ') || 'nothing'}.`,
      )
    }
  const diff = run.diagnosis.diff
  if (diff)
    out.push(
      `\nSince ${diff.commit} (${diff.since}): rebuilt ${diff.changed.join(', ') || 'nothing'}, controls ${diff.controls.join(', ') || 'none'}. ${diff.moved.length ? '' : 'Nothing moved past the spread.'}`,
      ...diff.moved
        .slice(0, 30)
        .map(
          (m) =>
            `  ${m.variant} ${m.page} ${METRICS[m.key].label}: ${fmt(m.key, m.was)} -> ${fmt(m.key, m.now)} (${m.verdict})`,
        ),
    )
  if (run.diagnosis.tune.length)
    out.push(
      '\nWhat to tune, most first:',
      ...run.diagnosis.tune
        .slice(0, 12)
        .map(
          (t, i) => `${i + 1}. [${t.where}] ${t.title} (~${t.impact} pts, ${t.variant}). ${t.why}`,
        ),
    )
  return out.join('\n')
}

function reportPages(run, names, out) {
  for (const path of run.pages) {
    out.push(
      `### ${path}\n`,
      `| | ${names.map((n) => run.variants[n].label).join(' | ')} |`,
      `|---|${names.map(() => '---').join('|')}|`,
    )
    for (const k of MAIN)
      out.push(
        `| ${METRICS[k].label} | ${names.map((n) => cell(k, run.variants[n].pages[path].metrics[k])).join(' | ')} |`,
      )
    for (const k of SITE_METRICS)
      if (names.some((n) => run.variants[n].pages[path].metrics[k]))
        out.push(
          `| ${METRICS[k].label} | ${names.map((n) => cell(k, run.variants[n].pages[path].metrics[k])).join(' | ')} |`,
        )
    if (names.some((n) => run.variants[n].pages[path].canary))
      out.push(
        `| Freshness | ${names
          .map((n) => {
            const c = run.variants[n].pages[path].canary
            return c ? `${c.label}${c.checked ? ` (${c.checked} canaries)` : ''}` : '–'
          })
          .join(' | ')} |`,
      )
    out.push('')
  }
}
