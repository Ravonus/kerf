import { PER, kb } from './units.mjs'

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

function lcpLoss({ p, path, l, add }) {
  const phases = Object.entries(p.lcp.phases).sort((a, b) => b[1] - a[1]),
    [phase] = phases[0] ?? ['unknown', 0]
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
}

function fontsFinding({ p, path, add }) {
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
}

function unusedFindings({ p, path, split, kit, add }) {
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

export function tuneLosses({ p, path, split, kit, add }) {
  for (const l of p.lost.mobile) {
    if (l.metric === 'LCP') lcpLoss({ p, path, l, add })
    else
      add(`lost:${l.metric}`, {
        where: 'weft',
        title: `${l.metric} costs mobile points`,
        why: `${l.points} mobile points on ${path}.`,
        impact: l.points,
        pages: [path],
      })
  }
  fontsFinding({ p, path, add })
  unusedFindings({ p, path, split, kit, add })
}
