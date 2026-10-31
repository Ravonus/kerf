// Every number here comes with its spread, and a win is only called when the spread allows it.

export const median = xs => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

/** `{ med, min, max, n }` of the numbers in `xs`; holes (a metric a run didn't report) are dropped. */
export function spread(xs) {
  const v = xs.filter(x => x != null && Number.isFinite(x))
  if (!v.length) return null
  return { med: median(v), min: Math.min(...v), max: Math.max(...v), n: v.length }
}

// floor: the smallest difference worth calling, in the metric's own unit. Bytes don't vary, ms and rps do.
export const METRICS = {
  'mobile.score': { label: 'Mobile score', unit: '', better: 'high', floor: 1 },
  'mobile.fcp': { label: 'Mobile FCP', unit: 'ms', better: 'low', floor: 50 },
  'mobile.lcp': { label: 'Mobile LCP', unit: 'ms', better: 'low', floor: 50 },
  'mobile.tbt': { label: 'Mobile TBT', unit: 'ms', better: 'low', floor: 10 },
  'mobile.cls': { label: 'Mobile CLS', unit: '', better: 'low', floor: 0.005 },
  'mobile.si': { label: 'Mobile speed index', unit: 'ms', better: 'low', floor: 50 },
  'desktop.score': { label: 'Desktop score', unit: '', better: 'high', floor: 1 },
  'desktop.fcp': { label: 'Desktop FCP', unit: 'ms', better: 'low', floor: 20 },
  'desktop.lcp': { label: 'Desktop LCP', unit: 'ms', better: 'low', floor: 20 },
  'desktop.tbt': { label: 'Desktop TBT', unit: 'ms', better: 'low', floor: 10 },
  'desktop.cls': { label: 'Desktop CLS', unit: '', better: 'low', floor: 0.005 },
  'desktop.si': { label: 'Desktop speed index', unit: 'ms', better: 'low', floor: 20 },
  'throttled.fcp': { label: 'Throttled FCP', unit: 'ms', better: 'low', floor: 100 },
  'throttled.lcp': { label: 'Throttled LCP', unit: 'ms', better: 'low', floor: 100 },
  'bytes.js.br': { label: 'JS br', unit: 'bytes', better: 'low', floor: 256 },
  'bytes.js.gz': { label: 'JS gzip', unit: 'bytes', better: 'low', floor: 256 },
  'bytes.css.br': { label: 'CSS br', unit: 'bytes', better: 'low', floor: 128 },
  'bytes.css.gz': { label: 'CSS gzip', unit: 'bytes', better: 'low', floor: 128 },
  'bytes.html.br': { label: 'HTML br', unit: 'bytes', better: 'low', floor: 128 },
  'bytes.html.gz': { label: 'HTML gzip', unit: 'bytes', better: 'low', floor: 128 },
  'bytes.font.br': { label: 'Font bytes', unit: 'bytes', better: 'low', floor: 512 },
  'bytes.font.gz': { label: 'Font gzip', unit: 'bytes', better: 'low', floor: 512 },
  'browser.hydrate': { label: 'Hydration', unit: 'ms', better: 'low', floor: 15 },
  'browser.script': { label: 'Script at load', unit: 'ms', better: 'low', floor: 15 },
  'browser.heap': { label: 'JS heap after load', unit: 'MB', better: 'low', floor: 0.1 },
  'browser.nodes': { label: 'DOM nodes', unit: '', better: 'low', floor: 10 },
  'browser.elements': { label: 'Elements', unit: '', better: 'low', floor: 10 },
  'browser.comments': { label: 'Comment nodes', unit: '', better: 'low', floor: 5 },
  'server.rps': { label: 'Server req/s', unit: 'rps', better: 'high', floor: 50 },
  'server.rpsPlain': { label: 'Server req/s, uncompressed', unit: 'rps', better: 'high', floor: 50 },
  'server.p95': { label: 'Server p95', unit: 'ms', better: 'low', floor: 1 },
}

/**
 * `win` when a beats b by more than the metric's floor and no sample of the two overlaps; otherwise `tie`. With n = 3 that
 * still leaves a 10% chance of a fluke per comparison, so a claim that matters should run with --runs 5 or more.
 */
export function compare(key, a, b) {
  const m = METRICS[key]
  if (!a || !b) return null
  const delta = a.med - b.med, ahead = m.better === 'low' ? a.max < b.min : a.min > b.max, behind = m.better === 'low' ? b.max < a.min : b.min > a.max
  return { delta, verdict: Math.abs(delta) < m.floor ? 'tie' : ahead ? 'win' : behind ? 'loss' : 'tie' }
}

export const fmt = (key, s) => {
  if (!s) return '–'
  const { unit } = METRICS[key] ?? {}, v = s.med ?? s
  if (unit === 'bytes') return `${(v / 1024).toFixed(1)}K`
  if (unit === 'MB') return `${v.toFixed(2)}MB`
  if (key.endsWith('.cls')) return v.toFixed(3)
  return `${Math.round(v)}${unit === 'ms' ? 'ms' : ''}`
}
