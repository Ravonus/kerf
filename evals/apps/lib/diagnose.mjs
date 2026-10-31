// The point of the benchmark: per weft variant, what cost it score and bytes, how far it is from the best other variant, what
// moved since the last run of this app, and a ranked list of what to tune.
import { METRICS, compare, fmt } from './stats.mjs'

const GAPS = ['mobile.score', 'mobile.lcp', 'mobile.fcp', 'mobile.tbt', 'mobile.si', 'desktop.score', 'throttled.lcp', 'bytes.js.br', 'bytes.css.br', 'bytes.html.br', 'bytes.font.br', 'browser.hydrate', 'browser.script', 'browser.heap', 'browser.nodes', 'browser.comments', 'server.rps', 'server.rpsPlain', 'server.p95']

/** The best other variant on one metric, by median, and whether the spread backs the gap. */
function gapAgainstBest(run, name, path, key) {
  const mine = run.variants[name].pages[path].metrics[key]
  if (!mine) return null
  const rivals = Object.entries(run.variants).filter(([k, r]) => k !== name && r.pages[path]?.metrics[key])
  if (!rivals.length) return null
  const low = METRICS[key].better === 'low'
  const [best, r] = rivals.reduce((a, b) => ((low ? b[1].pages[path].metrics[key].med < a[1].pages[path].metrics[key].med : b[1].pages[path].metrics[key].med > a[1].pages[path].metrics[key].med) ? b : a))
  const theirs = r.pages[path].metrics[key], c = compare(key, mine, theirs)
  return { key, best, mine, theirs, delta: c.delta, verdict: c.verdict }
}

/**
 * Metric medians that moved between two runs, past what either run's own spread explains. A variant whose build key didn't
 * change can't have really moved, so it isn't reported: it's the control, and how far the controls drifted on a timing metric
 * is taken off the variants that did change before they're judged.
 */
function diffRuns(run, prev) {
  const changed = Object.keys(run.variants).filter(n => prev.variants[n] && prev.variants[n].key !== run.variants[n].key), controls = Object.keys(run.variants).filter(n => prev.variants[n] && !changed.includes(n))
  const drift = (path, key) => {
    if (METRICS[key].unit !== 'ms') return 1
    const r = controls.map(n => [run.variants[n].pages[path]?.metrics[key]?.med, prev.variants[n].pages?.[path]?.[key]?.med]).filter(([a, b]) => a && b).map(([a, b]) => a / b).sort((a, b) => a - b)
    return r.length ? r[r.length >> 1] : 1
  }
  const moved = []
  for (const name of changed) for (const [path, page] of Object.entries(run.variants[name].pages)) for (const [key, now] of Object.entries(page.metrics)) {
    const old = prev.variants[name]?.pages?.[path]?.[key], d = drift(path, key)
    if (!old || !now) continue
    // Drift only ever removes a claim: a move has to hold both as measured and net of the controls.
    const c = compare(key, now, { ...old, med: old.med * d, min: old.min * d, max: old.max * d }), raw = compare(key, now, old)
    if (c && c.verdict !== 'tie' && c.verdict === raw.verdict) moved.push({ variant: name, page: path, key, was: old, now, delta: raw.delta, verdict: c.verdict === 'win' ? 'better' : 'worse' })
  }
  return { changed, controls, moved }
}

const pct = (n, of) => `${Math.round(100 * n / of)}%`
const kb = n => `${(n / 1024).toFixed(1)} KB`

// A stated rate, not a law: rough score points per unit, so size and time rank against each other at all.
const PER = { kb: 0.1, hydrateMs: 0.02, heapMB: 0.3 }

const PHASE_ADVICE = [
  [/first byte|ttfb/, 'weft', 'server response', 'Stream or cache the shell; look at what the server does before the first byte.'],
  [/render delay/, 'weft', 'render delay', 'The LCP element is in the HTML but paints late: look at what blocks it, usually render-blocking CSS, webfont swap, or a hidden state lifted by hydration.'],
  [/load delay/, 'weft', 'resource load delay', 'The LCP resource is found late: emit a preload for it from the server render.'],
  [/load (duration|time)/, 'weft', 'resource load', 'The LCP resource takes long to arrive: shrink or preconnect it.'],
]

function tuneFor(run, name) {
  const v = run.variants[name], items = new Map()
  // On a warp variant, what costs size or hydration is warp's to answer for until the split says otherwise.
  const kit = v.stack === 'weft+warp' ? 'warp' : 'weft'
  const add = (id, item) => { const was = items.get(id); if (!was || item.impact > was.impact) items.set(id, { ...item, pages: [...new Set([...(was?.pages ?? []), ...item.pages])] }); else was.pages = [...new Set([...was.pages, ...item.pages])] }
  for (const [path, p] of Object.entries(v.pages)) {
    const split = v.split?.pages?.[path]?.groups ?? {}
    for (const l of p.lost.mobile) {
      if (l.metric === 'LCP') {
        const phases = Object.entries(p.lcp.phases).sort((a, b) => b[1] - a[1]), [phase, ms] = phases[0] ?? ['unknown', 0]
        const advice = PHASE_ADVICE.find(([re]) => re.test(phase))
        add(`lcp:${advice?.[2] ?? phase}`, { where: advice?.[1] ?? 'weft', title: `LCP: ${advice?.[2] ?? phase} is the largest phase`, why: `${l.points} mobile points lost to LCP on ${path}. Really throttled: ${phases.map(([k, n]) => `${k} ${n}ms`).join(', ')}. Lantern, which sets the score: ${Object.entries(p.lcp.simulated ?? {}).map(([k, n]) => `${k} ${Math.round(n)}ms`).join(', ')}. Element: ${p.lcp.element ?? 'unknown'}. ${advice?.[3] ?? ''}`, impact: l.points, pages: [path] })
      } else add(`lost:${l.metric}`, { where: 'weft', title: `${l.metric} costs mobile points`, why: `${l.points} mobile points on ${path}.`, impact: l.points, pages: [path] })
    }
    const big = p.top[0]
    if (big?.type === 'font' && big.br > p.metrics['bytes.js.br'].med) add('fonts', { where: 'weft', title: 'Fonts outweigh everything else on the page', why: `${kb(p.metrics['bytes.font.br'].med)} of fonts against ${kb(p.metrics['bytes.js.br'].med)} of JS on ${path}; largest ${big.path.split('/').pop()} at ${kb(big.br)}. Same in every variant, so a default to win, not a gap: subset harder, and check the LCP text isn't waiting on it.`, impact: (p.lost.mobile.find(l => l.metric === 'LCP')?.points ?? 0) + p.metrics['bytes.font.br'].med / 1024 * PER.kb * 0.25, pages: [path] })
    if (p.unused.js > 2048) {
      const biggest = Object.entries(split).filter(([g]) => g !== 'app').sort((a, b) => b[1] - a[1])[0]
      add('unused-js', { where: biggest?.[0] === 'warp' ? 'warp' : 'weft', title: 'JS shipped but not run at load', why: `${kb(p.unused.js)} br of ${kb(p.metrics['bytes.js.br'].med)} never ran on ${path}${biggest ? `; largest framework group: ${biggest[0]} (${kb(biggest[1])})` : ''}.`, impact: p.unused.js / 1024 * PER.kb, pages: [path] })
    }
    if (p.unused.css > 1024) add('unused-css', { where: kit, title: 'CSS shipped but not used on the page', why: `${kb(p.unused.css)} br of ${kb(p.metrics['bytes.css.br'].med)} matched nothing on ${path}. One stylesheet for every route; per-route CSS would cut it.`, impact: p.unused.css / 1024 * PER.kb, pages: [path] })
    for (const g of GAPS) {
      const gap = gapAgainstBest(run, name, path, g)
      if (!gap || gap.verdict !== 'loss') continue
      const d = Math.abs(gap.delta), m = METRICS[g], gapText = `${fmt(g, gap.mine)} vs ${fmt(g, gap.theirs)} (${run.variants[gap.best].label}) on ${path}`
      if (g === 'bytes.js.br') {
        const parts = Object.entries(split).filter(([k]) => k !== 'unmapped').sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${k} ${kb(n)}`).join(', ')
        add('gap:js', { where: kit, title: 'JS size behind the best variant', why: `${gapText}. ${parts}.`, impact: d / 1024 * PER.kb, pages: [path] })
      } else if (m.unit === 'bytes') add(`gap:${g}`, { where: kit, title: `${m.label} behind the best variant`, why: gapText, impact: d / 1024 * PER.kb, pages: [path] })
      else if (g === 'browser.hydrate') add('gap:hydrate', { where: kit, title: 'Hydration slower than the best variant', why: `${gapText}, 4x CPU, ${p.method}.`, impact: d * PER.hydrateMs, pages: [path] })
      else if (g === 'browser.heap') add('gap:heap', { where: kit, title: 'Heap after load above the best variant', why: gapText, impact: d * PER.heapMB, pages: [path] })
      else if (g.startsWith('server.')) add(`gap:${g}`, { where: 'weft', title: `${m.label} behind the best variant`, why: `${gapText}; served as ${p.loadEncoding} against ${run.variants[gap.best].pages[path].loadEncoding}.`, impact: 0.5, pages: [path] })
      else if (g === 'mobile.tbt' || g === 'browser.script' || g === 'browser.nodes' || g === 'browser.comments') add(`gap:${g}`, { where: 'weft', title: `${m.label} behind the best variant`, why: gapText, impact: 0.3, pages: [path] })
    }
    if (split.warp) add('warp-share', { where: 'warp', title: 'warp code in the first load', why: `${kb(split.warp)} br of ${kb(p.metrics['bytes.js.br'].med)} on ${path}.`, impact: split.warp / 1024 * PER.kb, pages: [path] })
    for (const f of p.findings.slice(0, 6)) if (!/font-display|cache/.test(f.id)) add(`lh:${f.id}`, { where: 'weft', title: f.title, why: `Lighthouse on ${path}${f.value ? `: ${f.value}` : ''}.`, impact: 0.2, pages: [path] })
  }
  return [...items.values()].sort((a, b) => b.impact - a.impact).map(i => ({ ...i, variant: name, impact: +i.impact.toFixed(1) }))
}

export function diagnose(run, prev) {
  const weft = Object.entries(run.variants).filter(([, v]) => v.family === 'weft').map(([k]) => k)
  const out = { diff: prev ? { since: prev.at, commit: prev.commit, ...diffRuns(run, prev) } : null, variants: {}, tune: [] }
  for (const name of weft) {
    const gaps = {}
    for (const path of Object.keys(run.variants[name].pages)) gaps[path] = GAPS.map(k => gapAgainstBest(run, name, path, k)).filter(Boolean).map(({ key, best, mine, theirs, delta, verdict }) => ({ key, best, mine: mine.med, theirs: theirs.med, delta, verdict }))
    out.variants[name] = { gaps }
    out.tune.push(...tuneFor(run, name))
  }
  out.tune.sort((a, b) => b.impact - a.impact)
  return out
}

const MAIN = ['mobile.score', 'mobile.lcp', 'throttled.lcp', 'mobile.tbt', 'mobile.cls', 'desktop.score', 'desktop.lcp', 'bytes.js.br', 'bytes.css.br', 'bytes.html.br', 'bytes.font.br', 'browser.hydrate', 'browser.heap', 'browser.nodes', 'server.rps', 'server.rpsPlain', 'server.p95']
const cell = (k, s) => (s ? (k.startsWith('bytes.') || s.max === s.min ? fmt(k, s) : `${fmt(k, s)} [${fmt(k, { med: s.min })}–${fmt(k, { med: s.max })}]`) : '–')

/** The run as markdown, for the terminal. */
export function report(run) {
  const names = Object.keys(run.variants), out = [`\n## ${run.label}, ${run.commit}${run.dirty ? ' (dirty)' : ''}, ${run.runs} runs, peak load ${run.loadMax?.toFixed(1)}\n`]
  for (const path of run.pages) {
    out.push(`### ${path}\n`, `| | ${names.map(n => run.variants[n].label).join(' | ')} |`, `|---|${names.map(() => '---').join('|')}|`)
    for (const k of MAIN) out.push(`| ${METRICS[k].label} | ${names.map(n => cell(k, run.variants[n].pages[path].metrics[k])).join(' | ')} |`)
    out.push('')
  }
  out.push(`| Build / lines | ${names.map(n => `${(run.variants[n].build.med / 1000).toFixed(1)}s / ${run.variants[n].lines}`).join(' | ')} |\n`)
  for (const [name, d] of Object.entries(run.diagnosis.variants)) for (const [path, gaps] of Object.entries(d.gaps)) {
    const wins = gaps.filter(g => g.verdict === 'win').map(g => METRICS[g.key].label), losses = gaps.filter(g => g.verdict === 'loss').map(g => METRICS[g.key].label), ties = gaps.filter(g => g.verdict === 'tie').map(g => METRICS[g.key].label)
    out.push(`${name} ${path} against the best other: ahead on ${wins.join(', ') || 'nothing'}; behind on ${losses.join(', ') || 'nothing'}; within spread on ${ties.join(', ') || 'nothing'}.`)
  }
  const diff = run.diagnosis.diff
  if (diff) out.push(`\nSince ${diff.commit} (${diff.since}): rebuilt ${diff.changed.join(', ') || 'nothing'}, controls ${diff.controls.join(', ') || 'none'}. ${diff.moved.length ? '' : 'Nothing moved past the spread.'}`, ...diff.moved.slice(0, 30).map(m => `  ${m.variant} ${m.page} ${METRICS[m.key].label}: ${fmt(m.key, m.was)} -> ${fmt(m.key, m.now)} (${m.verdict})`))
  if (run.diagnosis.tune.length) out.push('\nWhat to tune, most first:', ...run.diagnosis.tune.slice(0, 12).map((t, i) => `${i + 1}. [${t.where}] ${t.title} (~${t.impact} pts, ${t.variant}). ${t.why}`))
  return out.join('\n')
}
