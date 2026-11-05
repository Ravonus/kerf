import { join } from 'node:path'
import { pool } from '../../scripts/jobs.mjs'
import { freshness } from '../lib/app.mjs'
import { canaryPass, cookieHeader } from '../lib/flow.mjs'
import { bytesPass, hydrationPass, lighthouseRun, lighthouseThrottled } from '../lib/measure.mjs'
import { assertFresh } from '../lib/serve.mjs'
import { spread } from '../lib/stats.mjs'

/** The sample nearest the median, for what can't be medianed: LCP phases, findings, the resource list. */
const middle = (samples, key) => [...samples].sort((a, b) => a[key] - b[key])[samples.length >> 1]

/** The timing-sensitive half of a sample, in turn per variant: a pass here never shares a variant with another. */
async function timed(v, server, page, browser, site, load) {
  await site?.login() // a session cache lasts minutes and a run longer, so every stack starts each pass freshly signed in
  const url = server.url + page.path,
    cookies = site?.cookies(page)
  const first = await assertFresh(v, server)
  // The row a live page shows, changed now: a page that doesn't show it wasn't read for this sample.
  if (site && freshness(page, v.name) === 'live')
    await canaryPass(browser, url, page.canary, { db: site.db, cookies })
  const bytes = await bytesPass(browser, url, { cookies })
  await assertFresh(v, server, bytes.assets)
  const hyd = await hydrationPass(browser, url, page.probe, { cookies })
  const real = await lighthouseThrottled(url, cookieHeader(cookies))
  await assertFresh(v, server)
  return { bytes, hyd, real, lh: {}, fresh: first.canary, load: load() }
}

/** Lighthouse's simulated throttling models the network and CPU, so these can overlap: see README, and --jobs=1 to compare. */
async function simulated(v, server, sample, url, form, keepTo, cookie, load) {
  const lh = (sample.lh[form] = await lighthouseRun(url, form, keepTo, cookie))
  await assertFresh(
    v,
    server,
    lh.scripts
      .filter((u) => u.startsWith(server.url))
      .map((u) => u.slice(server.url.length))
      .filter((p) => sample.bytes.assets.includes(p) || !/[?]/.test(p)),
  )
  sample.load = Math.max(sample.load, load())
}

export function summarise(page, samples) {
  const pick = (f) => spread(samples.map(f)),
    m = {}
  for (const form of ['mobile', 'desktop'])
    for (const k of ['score', 'fcp', 'lcp', 'tbt', 'cls', 'si'])
      m[`${form}.${k}`] = pick((s) => s.lh[form][k])
  for (const t of ['js', 'css', 'html', 'font'])
    for (const c of ['br', 'gz']) m[`bytes.${t}.${c}`] = pick((s) => s.bytes.totals[t][c])
  for (const k of ['hydrate', 'script', 'heap', 'nodes', 'elements', 'comments'])
    m[`browser.${k}`] = pick((s) => s.hyd[k])
  m['throttled.lcp'] = pick((s) => s.real.lcp)
  m['throttled.fcp'] = pick((s) => s.real.fcp)
  const mid = middle(
      samples.map((s) => ({ ...s.lh.mobile, s })),
      'lcp',
    ).s,
    midD = middle(
      samples.map((s) => ({ ...s.lh.desktop, s })),
      'lcp',
    ).s
  const real = middle(
    samples.map((s) => s.real),
    'lcp',
  )
  return {
    metrics: m,
    method: samples[0].hyd.method,
    errors: [...new Set(samples.flatMap((s) => s.hyd.errors))],
    lost: { mobile: mid.lh.mobile.lost, desktop: midD.lh.desktop.lost },
    lcp: { ...real.lcpInfo, simulated: mid.lh.mobile.simulated },
    findings: mid.lh.mobile.findings,
    bootupMs: mid.lh.mobile.bootupMs,
    top: mid.bytes.top.slice(0, 40),
    assets: mid.bytes.assets,
    unused: mid.bytes.unusedBr,
    thirdParty: mid.bytes.thirdParty,
    encoding: mid.bytes.top.find((r) => r.type === 'js' || r.type === 'html')?.encoding,
    fresh: { samples: samples.length, canary: samples.every((s) => s.fresh) },
  }
}

export async function timedSamples({
  app,
  variants,
  samplesWanted,
  samples,
  jobs,
  servers,
  browser,
  sites,
  phase,
  load,
}) {
  const t = performance.now()
  // Variants side by side, each one's own passes in turn. Lighthouse waits for these, so nothing it does skews their timings.
  await pool(variants, jobs, async (v) => {
    for (let i = 0; i < samplesWanted; i++)
      for (const p of app.pages)
        samples[v.name][p.path].push(
          await timed(v, servers[v.name], p, browser, sites[v.name], load),
        )
  })
  phase('hydration, bytes, throttled LCP', t)
}

export async function lighthouseSamples({
  app,
  variants,
  samples,
  jobs,
  servers,
  sites,
  phase,
  load,
}) {
  const t = performance.now()
  const tasks = variants.flatMap((v) =>
    app.pages.flatMap((p) =>
      samples[v.name][p.path].flatMap((s, i) =>
        ['mobile', 'desktop'].map((form) => ({
          v,
          p,
          s,
          form,
          keep: i ? null : join(v.dir, `lighthouse${p.path.replace(/\W/g, '_')}-${form}.json`),
        })),
      ),
    ),
  )
  // Shuffled so that no variant always runs at the pool's busiest.
  tasks.sort(() => Math.random() - 0.5)
  for (const v of variants) await sites[v.name]?.login()
  await pool(tasks, jobs, ({ v, p, s, form, keep }) =>
    simulated(
      v,
      servers[v.name],
      s,
      servers[v.name].url + p.path,
      form,
      keep,
      cookieHeader(sites[v.name]?.cookies(p)),
      load,
    ),
  )
  phase(`Lighthouse, ${tasks.length} runs`, t)
}
