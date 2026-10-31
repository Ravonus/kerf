// One Lighthouse run in its own process, Chrome and profile. Takes its arguments as JSON and prints a digest of the report.
import { writeFileSync } from 'node:fs'
import * as chromeLauncher from 'chrome-launcher'
import lighthouse from 'lighthouse'
import desktopConfig from 'lighthouse/core/config/desktop-config.js'

const nums = { fcp: 'first-contentful-paint', lcp: 'largest-contentful-paint', tbt: 'total-blocking-time', cls: 'cumulative-layout-shift', si: 'speed-index' }

/** Score points each metric costs: its weight in the score, times how far the metric's own score falls short. */
function pointsLost(lhr) {
  return lhr.categories.performance.auditRefs.filter(r => r.weight > 0).map(r => ({ metric: r.acronym ?? r.id, points: +(r.weight * (1 - (lhr.audits[r.id].score ?? 1))).toFixed(1) })).filter(x => x.points > 0).sort((a, b) => b.points - a.points)
}

/** The phases of the LCP a trace saw. Only a really throttled run makes these mean anything: see lighthouseThrottled. */
function lcpBreakdown(lhr) {
  const a = lhr.audits['lcp-breakdown-insight'] ?? lhr.audits['largest-contentful-paint-element']
  const out = { element: null, phases: {} }
  for (const item of a?.details?.items ?? []) {
    if (item.type === 'table' || item.items) for (const row of item.items ?? []) {
      if (row.subpart ?? row.phase) out.phases[String(row.subpart ?? row.phase).replace(/([A-Z])/g, ' $1').toLowerCase().trim()] = Math.round(row.duration ?? row.timing ?? 0)
      if (row.node?.snippet) out.element ??= row.node.snippet.slice(0, 120)
    }
    if (item.type === 'node' || item.snippet) out.element ??= item.snippet?.slice(0, 120)
    if (item.node?.snippet) out.element ??= item.node.snippet.slice(0, 120)
  }
  return out
}

/** Lantern's phases for the score's LCP: it models the page, so a phase here can exceed anything a trace of the run shows. */
function simulatedPhases(lhr) {
  const m = lhr.audits.metrics?.details?.items?.[0]
  if (!m?.largestContentfulPaint) return null
  const ttfb = m.timeToFirstByte ?? 0, delay = m.lcpLoadDelay ?? 0, load = m.lcpLoadDuration ?? 0
  return { 'time to first byte': ttfb, 'load delay': delay, 'load duration': load, 'render delay': Math.max(0, m.largestContentfulPaint - ttfb - delay - load) }
}

/** The opportunities and insights that lost anything, for the ranked list. */
function findings(lhr) {
  const hits = []
  for (const r of lhr.categories.performance.auditRefs) {
    const a = lhr.audits[r.id]
    if (r.weight > 0 || !a || a.scoreDisplayMode === 'notApplicable' || a.scoreDisplayMode === 'informative' && !a.metricSavings) continue
    if (a.score === null || a.score >= 0.9) continue
    hits.push({ id: r.id, title: a.title, value: a.displayValue ?? null, savings: a.metricSavings ?? null })
  }
  return hits
}

const { url, formFactor, keepTo, real, chrome: chromePath } = JSON.parse(process.argv[2])
const chrome = await chromeLauncher.launch({ chromePath, chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'] })
try {
  const flags = { port: chrome.port, output: 'json', logLevel: 'silent', onlyCategories: ['performance'], ...(real ? { throttlingMethod: 'devtools' } : {}) }
  const { lhr } = await lighthouse(url, flags, formFactor === 'desktop' ? desktopConfig : undefined)
  if (lhr.runtimeError) throw new Error(`Lighthouse: ${lhr.runtimeError.code} on ${url}`)
  if (keepTo) writeFileSync(keepTo, JSON.stringify(lhr))
  const m = Object.fromEntries(Object.entries(nums).map(([k, id]) => [k, lhr.audits[id].numericValue]))
  process.stdout.write(JSON.stringify(real ? { lcp: m.lcp, fcp: m.fcp, lcpInfo: lcpBreakdown(lhr) } : {
    score: Math.round(lhr.categories.performance.score * 100), ...m, lost: pointsLost(lhr), lcpInfo: lcpBreakdown(lhr), simulated: simulatedPhases(lhr), findings: findings(lhr),
    bootupMs: lhr.audits['bootup-time']?.numericValue, mainThreadMs: lhr.audits['mainthread-work-breakdown']?.numericValue,
    scripts: (lhr.audits['network-requests']?.details?.items ?? []).filter(r => r.resourceType === 'Script' || r.resourceType === 'Stylesheet').map(r => r.url),
  }))
} finally { await chrome.kill() }
process.exit(0)
