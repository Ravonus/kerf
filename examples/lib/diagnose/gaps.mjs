import { METRICS, fmt } from '../stats.mjs'
import { PER, kb } from './units.mjs'

function sizeGap({ g, m, d, gapText, split, kit }) {
  if (g === 'bytes.js.br') {
    const parts = Object.entries(split)
      .filter(([k]) => k !== 'unmapped')
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([k, n]) => `${k} ${kb(n)}`)
      .join(', ')
    return [
      'gap:js',
      {
        where: kit,
        title: 'JS size behind the best variant',
        why: `${gapText}. ${parts}.`,
        impact: (d / 1024) * PER.kb,
      },
    ]
  }
  if (m.unit === 'bytes')
    return [
      `gap:${g}`,
      {
        where: kit,
        title: `${m.label} behind the best variant`,
        why: gapText,
        impact: (d / 1024) * PER.kb,
      },
    ]
  return null
}

const MINOR = new Set(['mobile.tbt', 'browser.script', 'browser.nodes', 'browser.comments'])

function timeGap({ g, m, d, gapText, p, run, gap, path, kit }) {
  if (g === 'browser.hydrate')
    return [
      'gap:hydrate',
      {
        where: kit,
        title: 'Hydration slower than the best variant',
        why: `${gapText}, 4x CPU, ${p.method}.`,
        impact: d * PER.hydrateMs,
      },
    ]
  if (g === 'browser.heap')
    return [
      'gap:heap',
      {
        where: kit,
        title: 'Heap after load above the best variant',
        why: gapText,
        impact: d * PER.heapMB,
      },
    ]
  return null
}

function serverGap({ g, m, gapText, p, run, gap, path }) {
  if (g.startsWith('server.'))
    return [
      `gap:${g}`,
      {
        where: 'kerf',
        title: `${m.label} behind the best variant`,
        why: `${gapText}; served as ${p.loadEncoding} against ${run.variants[gap.best].pages[path].loadEncoding}.`,
        impact: 0.5,
      },
    ]
  if (MINOR.has(g))
    return [
      `gap:${g}`,
      {
        where: 'kerf',
        title: `${m.label} behind the best variant`,
        why: gapText,
        impact: 0.3,
      },
    ]
  return null
}

export function tuneGaps({ run, name, path, p, split, kit, add, GAPS, gapAgainstBest }) {
  for (const g of GAPS) {
    const gap = gapAgainstBest(run, name, path, g)
    if (!gap || gap.verdict !== 'loss') continue
    const c = {
      g,
      gap,
      run,
      path,
      p,
      split,
      kit,
      d: Math.abs(gap.delta),
      m: METRICS[g],
      gapText: `${fmt(g, gap.mine)} vs ${fmt(g, gap.theirs)} (${run.variants[gap.best].label}) on ${path}`,
    }
    const found = sizeGap(c) ?? timeGap(c) ?? serverGap(c)
    if (found) add(found[0], { ...found[1], pages: [path] })
  }
}
