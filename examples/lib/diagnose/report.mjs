import { METRICS, SITE_METRICS, fmt } from '../stats.mjs'

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

function raceRows(run, names, out) {
  // A race failure outranks any millisecond, so it comes first.
  const races = [...new Set(names.flatMap((n) => Object.keys(run.variants[n].race ?? {})))]
  if (!races.length) return
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

function gapLines(run) {
  const lines = []
  for (const [name, d] of Object.entries(run.diagnosis.variants))
    for (const [path, gaps] of Object.entries(d.gaps)) {
      const label = (verdict) =>
          gaps.filter((g) => g.verdict === verdict).map((g) => METRICS[g.key].label),
        wins = label('win'),
        losses = label('loss'),
        ties = label('tie')
      lines.push(
        `${name} ${path} against the best other: ahead on ${wins.join(', ') || 'nothing'}; behind on ${losses.join(', ') || 'nothing'}; within spread on ${ties.join(', ') || 'nothing'}.`,
      )
    }
  return lines
}

function diffLines(diff) {
  return [
    `\nSince ${diff.commit} (${diff.since}): rebuilt ${diff.changed.join(', ') || 'nothing'}, controls ${diff.controls.join(', ') || 'none'}. ${diff.moved.length ? '' : 'Nothing moved past the spread.'}`,
    ...diff.moved
      .slice(0, 30)
      .map(
        (m) =>
          `  ${m.variant} ${m.page} ${METRICS[m.key].label}: ${fmt(m.key, m.was)} -> ${fmt(m.key, m.now)} (${m.verdict})`,
      ),
  ]
}

const tuneLines = (tune) => [
  '\nWhat to tune, most first:',
  ...tune
    .slice(0, 12)
    .map((t, i) => `${i + 1}. [${t.where}] ${t.title} (~${t.impact} pts, ${t.variant}). ${t.why}`),
]

/** The run as markdown, for the terminal. */
export function report(run) {
  const names = Object.keys(run.variants),
    out = [
      `\n## ${run.label}, ${run.commit}${run.dirty ? ' (dirty)' : ''}, ${run.runs} runs, peak load ${run.loadMax?.toFixed(1)}\n`,
    ]
  raceRows(run, names, out)
  reportPages(run, names, out)
  out.push(
    `| Build / lines | ${names.map((n) => `${(run.variants[n].build.med / 1000).toFixed(1)}s / ${run.variants[n].lines}`).join(' | ')} |\n`,
    ...gapLines(run),
  )
  if (run.diagnosis.diff) out.push(...diffLines(run.diagnosis.diff))
  if (run.diagnosis.tune.length) out.push(...tuneLines(run.diagnosis.tune))
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
