import { METRICS, fmt } from '../stats.mjs'

const kb = (n) => `${(n / 1024).toFixed(1)} KB`

// A stated rate, not a law: rough score points per unit, so size and time rank against each other at all.
const PER = { kb: 0.1, hydrateMs: 0.02, heapMB: 0.3 }

const PHASE_ADVICE = [
  [
    /first byte|ttfb/,
    'weft',
    'server response',
    'Stream or cache the shell; look at what the server does before the first byte.',
  ],
  [
    /render delay/,
    'weft',
    'render delay',
    'The LCP element is in the HTML but paints late: look at what blocks it, usually render-blocking CSS, webfont swap, or a hidden state lifted by hydration.',
  ],
  [
    /load delay/,
    'weft',
    'resource load delay',
    'The LCP resource is found late: emit a preload for it from the server render.',
  ],
  [
    /load (duration|time)/,
    'weft',
    'resource load',
    'The LCP resource takes long to arrive: shrink or preconnect it.',
  ],
]

export function tuneFor(run, name, GAPS, gapAgainstBest) {
  const v = run.variants[name],
    items = new Map()
  // On a warp variant, what costs size or hydration is warp's to answer for until the split says otherwise.
  const kit = v.stack === 'weft+warp' ? 'warp' : 'weft'
  const add = (id, item) => {
    const was = items.get(id)
    if (!was || item.impact > was.impact)
      items.set(id, { ...item, pages: [...new Set([...(was?.pages ?? []), ...item.pages])] })
    else was.pages = [...new Set([...was.pages, ...item.pages])]
  }
  for (const [path, p] of Object.entries(v.pages)) {
    const split = v.split?.pages?.[path]?.groups ?? {}
    tuneLosses({ p, path, split, kit, add })
    tuneGaps({ run, name, path, p, split, kit, add, GAPS, gapAgainstBest })
    tuneFindings({ p, path, split, add })
  }
  return [...items.values()]
    .sort((a, b) => b.impact - a.impact)
    .map((i) => ({ ...i, variant: name, impact: +i.impact.toFixed(1) }))
}

function tuneLosses({ p, path, split, kit, add }) {
  for (const l of p.lost.mobile) {
    if (l.metric === 'LCP') {
      const phases = Object.entries(p.lcp.phases).sort((a, b) => b[1] - a[1]),
        [phase, ms] = phases[0] ?? ['unknown', 0]
      const advice = PHASE_ADVICE.find(([re]) => re.test(phase))
      add(`lcp:${advice?.[2] ?? phase}`, {
        where: advice?.[1] ?? 'weft',
        title: `LCP: ${advice?.[2] ?? phase} is the largest phase`,
        why: `${l.points} mobile points lost to LCP on ${path}. Really throttled: ${phases.map(([k, n]) => `${k} ${n}ms`).join(', ')}. Lantern, which sets the score: ${Object.entries(
          p.lcp.simulated ?? {},
        )
          .map(([k, n]) => `${k} ${Math.round(n)}ms`)
          .join(', ')}. Element: ${p.lcp.element ?? 'unknown'}. ${advice?.[3] ?? ''}`,
        impact: l.points,
        pages: [path],
      })
    } else
      add(`lost:${l.metric}`, {
        where: 'weft',
        title: `${l.metric} costs mobile points`,
        why: `${l.points} mobile points on ${path}.`,
        impact: l.points,
        pages: [path],
      })
  }
  const big = p.top[0]
  if (big?.type === 'font' && big.br > p.metrics['bytes.js.br'].med)
    add('fonts', {
      where: 'weft',
      title: 'Fonts outweigh everything else on the page',
      why: `${kb(p.metrics['bytes.font.br'].med)} of fonts against ${kb(p.metrics['bytes.js.br'].med)} of JS on ${path}; largest ${big.path.split('/').pop()} at ${kb(big.br)}. Same in every variant, so a default to win, not a gap: subset harder, and check the LCP text isn't waiting on it.`,
      impact:
        (p.lost.mobile.find((l) => l.metric === 'LCP')?.points ?? 0) +
        (p.metrics['bytes.font.br'].med / 1024) * PER.kb * 0.25,
      pages: [path],
    })
  if (p.unused.js > 2048) {
    const biggest = Object.entries(split)
      .filter(([g]) => g !== 'app')
      .sort((a, b) => b[1] - a[1])[0]
    add('unused-js', {
      where: biggest?.[0] === 'warp' ? 'warp' : 'weft',
      title: 'JS shipped but not run at load',
      why: `${kb(p.unused.js)} br of ${kb(p.metrics['bytes.js.br'].med)} never ran on ${path}${biggest ? `; largest framework group: ${biggest[0]} (${kb(biggest[1])})` : ''}.`,
      impact: (p.unused.js / 1024) * PER.kb,
      pages: [path],
    })
  }
  if (p.unused.css > 1024)
    add('unused-css', {
      where: kit,
      title: 'CSS shipped but not used on the page',
      why: `${kb(p.unused.css)} br of ${kb(p.metrics['bytes.css.br'].med)} matched nothing on ${path}. One stylesheet for every route; per-route CSS would cut it.`,
      impact: (p.unused.css / 1024) * PER.kb,
      pages: [path],
    })
}

function tuneGaps({ run, name, path, p, split, kit, add, GAPS, gapAgainstBest }) {
  for (const g of GAPS) {
    const gap = gapAgainstBest(run, name, path, g)
    if (!gap || gap.verdict !== 'loss') continue
    const d = Math.abs(gap.delta),
      m = METRICS[g],
      gapText = `${fmt(g, gap.mine)} vs ${fmt(g, gap.theirs)} (${run.variants[gap.best].label}) on ${path}`
    if (g === 'bytes.js.br') {
      const parts = Object.entries(split)
        .filter(([k]) => k !== 'unmapped')
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([k, n]) => `${k} ${kb(n)}`)
        .join(', ')
      add('gap:js', {
        where: kit,
        title: 'JS size behind the best variant',
        why: `${gapText}. ${parts}.`,
        impact: (d / 1024) * PER.kb,
        pages: [path],
      })
    } else if (m.unit === 'bytes')
      add(`gap:${g}`, {
        where: kit,
        title: `${m.label} behind the best variant`,
        why: gapText,
        impact: (d / 1024) * PER.kb,
        pages: [path],
      })
    else if (g === 'browser.hydrate')
      add('gap:hydrate', {
        where: kit,
        title: 'Hydration slower than the best variant',
        why: `${gapText}, 4x CPU, ${p.method}.`,
        impact: d * PER.hydrateMs,
        pages: [path],
      })
    else if (g === 'browser.heap')
      add('gap:heap', {
        where: kit,
        title: 'Heap after load above the best variant',
        why: gapText,
        impact: d * PER.heapMB,
        pages: [path],
      })
    else if (g.startsWith('server.'))
      add(`gap:${g}`, {
        where: 'weft',
        title: `${m.label} behind the best variant`,
        why: `${gapText}; served as ${p.loadEncoding} against ${run.variants[gap.best].pages[path].loadEncoding}.`,
        impact: 0.5,
        pages: [path],
      })
    else if (
      g === 'mobile.tbt' ||
      g === 'browser.script' ||
      g === 'browser.nodes' ||
      g === 'browser.comments'
    )
      add(`gap:${g}`, {
        where: 'weft',
        title: `${m.label} behind the best variant`,
        why: gapText,
        impact: 0.3,
        pages: [path],
      })
  }
}

function tuneFindings({ p, path, split, add }) {
  if (split.warp)
    add('warp-share', {
      where: 'warp',
      title: 'warp code in the first load',
      why: `${kb(split.warp)} br of ${kb(p.metrics['bytes.js.br'].med)} on ${path}.`,
      impact: (split.warp / 1024) * PER.kb,
      pages: [path],
    })
  for (const f of p.findings.slice(0, 6))
    if (!/font-display|cache/.test(f.id))
      add(`lh:${f.id}`, {
        where: 'weft',
        title: f.title,
        why: `Lighthouse on ${path}${f.value ? `: ${f.value}` : ''}.`,
        impact: 0.2,
        pages: [path],
      })
}
