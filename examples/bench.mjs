#!/usr/bin/env node
// A real app against its other versions, on production builds: what each one scores, downloads and costs, and what to tune in
// weft and warp because of it (README.md).
//   node bench.mjs <app|folder|app.json> [more apps]    or --all
//     --samples=N       samples per page, default 3 (5 before making a claim)
//     --jobs=N          how much at once; WEFT_JOBS too, default half the free cores, at most 8; 1 runs everything in turn
//     --build-runs=N    cold builds per variant when its inputs changed, default 3
//     --rebuild         build even if the inputs haven't changed
//     --only=a,b        just these variants
//     --no-load         skip the server load
//     --no-record       print only: no results.json, history line or chart
//     --json=file       also write the run there, to compare it with another
//     --detect          print what the manifest and package.json resolve to, and stop
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { cpus, homedir, hostname, loadavg } from 'node:os'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
import { allApps, freshness, here, loadApp } from './lib/app.mjs'
import { cpuBusy, jobs as defaultJobs, pool } from '../scripts/jobs.mjs'
import { attribute } from './lib/attribute.mjs'
import { linesOfCode, packOnce, prepare, repoState } from './lib/build.mjs'
import { diagnose, report } from './lib/diagnose.mjs'
import { canaryPass, cookieHeader, signIn, sitePass } from './lib/flow.mjs'
import {
  bytesPass,
  hydrationPass,
  launchBrowser,
  lighthouseRun,
  lighthouseThrottled,
  loadPass,
} from './lib/measure.mjs'
import { assertFresh, rssMB, startServer } from './lib/serve.mjs'
import { spread } from './lib/stats.mjs'
import { provision, serverInfo } from './shared/pg/env.mjs'

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    all: { type: 'boolean' },
    samples: { type: 'string', default: '3' },
    jobs: { type: 'string' },
    'build-runs': { type: 'string', default: '3' },
    only: { type: 'string' },
    rebuild: { type: 'boolean' },
    json: { type: 'string' },
    'no-load': { type: 'boolean' },
    'no-record': { type: 'boolean' },
    detect: { type: 'boolean' },
  },
})
const say = (s) => process.stderr.write(`${s}\n`)
const windows = process.platform === 'win32'
// Load the shared Mac can take before measurements mean nothing; see ~/.claude/CLAUDE.md. Windows has no load average, so a share of the CPU.
const BUSY = windows ? 80 : 40,
  load = (ms) => (windows ? 100 * cpuBusy(ms) : loadavg()[0])
process.on('SIGINT', () => process.exit(130))
process.on('SIGTERM', () => process.exit(143))
const results = join(here, 'results.json'),
  history = join(here, '../evals/results/apps-history.jsonl')
const work = process.env.BENCH_WORK ?? join(homedir(), '.cache/weft-app-bench'),
  store = join(work, 'store')
const samplesWanted = +opt.samples,
  buildRuns = +opt['build-runs'],
  jobs = defaultJobs()

const targets = opt.all ? allApps() : positionals
if (!targets.length) {
  console.error('usage: node bench.mjs <app>... | --all   (see the top of this file)')
  process.exit(1)
}
// `--all` runs what's there: a site whose variants aren't written yet is skipped, and named on the way.
const apps = targets.flatMap((t) => {
  try {
    return [loadApp(t, { only: opt.only?.split(',') })]
  } catch (e) {
    if (!opt.all) throw e
    say(`skipping ${t}: ${e.message}`)
    return []
  }
})
if (opt.detect) {
  for (const a of apps)
    for (const v of a.variants)
      console.log(
        `${a.name}/${v.name}: ${v.stack.id} (${v.pm}), build \`${v.build}\`, start \`${v.start ?? 'static'}\`, from ${v.path}${v.cwd === '.' ? '' : `/${v.cwd}`}`,
      )
  process.exit(0)
}
if (+process.versions.node.split('.')[0] < 26) {
  console.error(`weft needs Node 26; this is ${process.version}`)
  process.exit(1)
}
const atStart = load(3000)
if (atStart > BUSY) {
  console.error(
    `${windows ? 'CPU busy' : '1-minute load'} is ${atStart.toFixed(0)}${windows ? '%' : ''}, over ${BUSY}: numbers would be noise. Run this on another machine.`,
  )
  process.exit(1)
}

/** The sample nearest the median, for what can't be medianed: LCP phases, findings, the resource list. */
const middle = (samples, key) => [...samples].sort((a, b) => a[key] - b[key])[samples.length >> 1]

/** The timing-sensitive half of a sample, in turn per variant: a pass here never shares a variant with another. */
async function timed(v, server, page, browser, site) {
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
async function simulated(v, server, sample, url, form, keepTo, cookie) {
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

function summarise(page, samples) {
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

async function benchApp(app) {
  const t0 = performance.now(),
    runId = Date.now().toString(36),
    only = opt.only?.split(','),
    variants = app.variants.filter((v) => !only || only.includes(v.name))
  const phase = (name, since) =>
    say(`  ${name}: ${((performance.now() - since) / 1000).toFixed(0)} s`)
  say(
    `\n${app.name}: ${variants.map((v) => `${v.name} (${v.stack.id})`).join(', ')}; ${app.pages.length} pages, ${samplesWanted} samples, ${jobs} jobs`,
  )
  const out = {},
    dbs = {},
    sites = {}
  if (app.db)
    for (const v of variants) {
      dbs[v.name] = await provision(app.name, v.name, { rtt: app.db.rtt[0] })
      v.dbEnv = dbs[v.name].env
    }
  const weft = variants.some((v) => v.tarballs)
    ? await packOnce(store, join(work, 'pack.log'))
    : null
  if (weft?.packed) say('  packed this checkout')
  let t = performance.now()
  await pool(variants, jobs, async (v) => {
    const { build, reused, key } = await prepare(app, v, {
      work,
      runId,
      store,
      weft: weft?.inputs,
      buildRuns,
      rebuild: opt.rebuild,
    })
    out[v.name] = {
      label: v.label,
      stack: v.stack.id,
      family: v.stack.family,
      pm: v.pm,
      build,
      buildReused: reused,
      key: key.slice(0, 16),
      lines: linesOfCode(v),
      weft: v.weft,
      pages: {},
    }
    say(
      `  ${v.name}: ${reused ? 'build reused' : `built in ${Math.round(build.med)} ms`}, ${out[v.name].lines} lines, ${v.fresh.hashes.size} assets fingerprinted`,
    )
  })
  phase('builds', t)
  const browser = await launchBrowser(),
    servers = {},
    samples = {}
  try {
    for (const v of variants) {
      servers[v.name] = await startServer(v, app.pages[0].path)
      samples[v.name] = Object.fromEntries(app.pages.map((p) => [p.path, []]))
      out[v.name].bootMs = servers[v.name].bootMs
      if (app.db) {
        const site = (sites[v.name] = {
          db: dbs[v.name],
          url: servers[v.name].url,
          jar: [],
          cookies: (p) => (p?.signedOut ? [] : site.jar),
          login: async () => {
            if (app.login) site.jar = await signIn(browser, site.url, app.login)
          },
        })
        await site.login()
      }
    }
    t = performance.now()
    // Variants side by side, each one's own passes in turn. Lighthouse waits for these, so nothing it does skews their timings.
    await pool(variants, jobs, async (v) => {
      for (let i = 0; i < samplesWanted; i++)
        for (const p of app.pages)
          samples[v.name][p.path].push(await timed(v, servers[v.name], p, browser, sites[v.name]))
    })
    phase('hydration, bytes, throttled LCP', t)
    t = performance.now()
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
      ),
    )
    phase(`Lighthouse, ${tasks.length} runs`, t)
    t = performance.now()
    for (const v of variants)
      for (const p of app.pages) out[v.name].pages[p.path] = summarise(p, samples[v.name][p.path])
    // Not a static build: its throughput would only be bench's own host.
    // One variant at a time: side by side, the load generators compete and every req/s reads about 25% low.
    if (!opt['no-load'])
      await pool(
        variants.filter((x) => x.start),
        1,
        async (v) => {
          for (const p of app.pages) {
            await sites[v.name]?.login()
            const s = [],
              plain = [],
              url = servers[v.name].url + p.path,
              cookie = cookieHeader(sites[v.name]?.cookies(p))
            await loadPass(url, { seconds: 0.5, cookie }) // warm, not counted
            for (let i = 0; i < samplesWanted; i++) {
              s.push(await loadPass(url, { cookie }))
              plain.push(await loadPass(url, { encoding: 'identity', seconds: 1, cookie }))
            }
            const errors = [...s, ...plain].reduce((n, x) => n + x.errors, 0),
              m = out[v.name].pages[p.path].metrics
            if (errors) say(`  ${v.name} ${p.path}: ${errors} failed requests under load`)
            m['server.rps'] = spread(s.map((x) => x.rps))
            m['server.p95'] = spread(s.map((x) => x.p95))
            m['server.rpsPlain'] = spread(plain.map((x) => x.rps))
            out[v.name].pages[p.path].loadErrors = errors
            out[v.name].pages[p.path].loadEncoding = s[0].served
          }
          await assertFresh(v, servers[v.name])
          out[v.name].rssMB = rssMB(servers[v.name])
        },
      )
    phase('server load', t)
    t = performance.now()
    // Last, and one variant at a time: these reset the database and set the proxy's RTT.
    if (app.db) {
      await pool(variants, 1, (v) =>
        sitePass({
          app,
          v,
          site: sites[v.name],
          server: servers[v.name],
          browser,
          samples: samplesWanted,
          out: out[v.name],
          say,
        }),
      )
      for (const v of variants) await assertFresh(v, servers[v.name])
      phase('database, flows, races', t)
    }
  } finally {
    await browser.close()
    for (const s of Object.values(servers)) await s.stop()
    for (const d of Object.values(dbs)) await d.stop()
  }
  for (const v of variants) if (v.maps) out[v.name].split = attribute(v, v.maps, out[v.name].pages)
  say(`  ${app.name}: ${((performance.now() - t0) / 1000).toFixed(0)} s in all`)
  const state = repoState(),
    line = {
      at: new Date().toISOString(),
      app: app.name,
      ...state,
      runs: samplesWanted,
      jobs,
      seconds: Math.round((performance.now() - t0) / 1000),
      cores: cpus().length,
      host: hostname(),
      loadMax: Math.max(
        ...Object.values(samples).flatMap((p) =>
          Object.values(p).flatMap((l) => l.map((s) => s.load)),
        ),
      ),
    }
  const prev = existsSync(history)
    ? readFileSync(history, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
        .findLast((l) => l.app === app.name && Object.keys(l.variants).some((k) => k in out))
    : null
  const run = {
    ...line,
    label: app.label,
    note: app.note,
    pages: app.pages.map((p) => p.path),
    baseline: app.baseline,
    variants: out,
    ...(app.db && { db: await serverInfo() }),
  }
  run.diagnosis = diagnose(run, prev)
  return {
    run,
    line: {
      ...line,
      variants: Object.fromEntries(
        Object.entries(out).map(([k, r]) => [
          k,
          {
            label: r.label,
            stack: r.stack,
            key: r.key,
            build: r.build,
            lines: r.lines,
            weft: r.weft?.tgz,
            pages: Object.fromEntries(Object.entries(r.pages).map(([p, x]) => [p, x.metrics])),
          },
        ]),
      ),
    },
  }
}

for (const app of apps) {
  const { run, line } = await benchApp(app)
  console.log(report(run))
  if (opt.json) writeFileSync(opt.json, JSON.stringify(run, null, 1))
  if (opt['no-record']) continue
  const all = existsSync(results) ? JSON.parse(readFileSync(results, 'utf8')) : {}
  all[app.name] = run
  writeFileSync(results, JSON.stringify(all, null, 1) + '\n')
  mkdirSync(dirname(history), { recursive: true })
  appendFileSync(history, JSON.stringify(line) + '\n')
  execFileSync(process.execPath, [join(here, 'chart.mjs')], { stdio: 'inherit' })
}
if (!opt['no-record']) say(`\nchart: ${join(here, '../evals/results/apps.html')}`)
