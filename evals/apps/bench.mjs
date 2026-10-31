#!/usr/bin/env node
// A real app against its other versions, on production builds: what each one scores, downloads and costs, and what to tune in
// weft and warp because of it (README.md).
//   node bench.mjs <app|folder|app.json> [more apps]    or --all
//     --runs N          samples per page, default 3 (5 before making a claim)
//     --build-runs N    cold builds per variant, default 3
//     --only a,b        just these variants
//     --no-load         skip the server load
//     --no-record       print only: no results.json, history line or chart
//     --detect          print what the manifest and package.json resolve to, and stop
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { cpus, homedir, hostname, loadavg } from 'node:os'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
import { allApps, here, loadApp } from './lib/app.mjs'
import { attribute } from './lib/attribute.mjs'
import { buildAll, buildWithMaps, linesOfCode, localMjs, prepare, repoState } from './lib/build.mjs'
import { diagnose, report } from './lib/diagnose.mjs'
import { bytesPass, hydrationPass, launchBrowser, lighthouseRun, lighthouseThrottled, loadPass } from './lib/measure.mjs'
import { assertFresh, rssMB, startServer } from './lib/serve.mjs'
import { spread } from './lib/stats.mjs'

const { values: opt, positionals } = parseArgs({ allowPositionals: true, options: {
  all: { type: 'boolean' }, runs: { type: 'string', default: '3' }, 'build-runs': { type: 'string', default: '3' }, only: { type: 'string' },
  'no-load': { type: 'boolean' }, 'no-record': { type: 'boolean' }, detect: { type: 'boolean' },
} })
const say = s => process.stderr.write(`${s}\n`)
const BUSY = 40 // load the shared Mac can take before measurements mean nothing; see ~/.claude/CLAUDE.md
process.on('SIGINT', () => process.exit(130)); process.on('SIGTERM', () => process.exit(143))
const results = join(here, 'results.json'), history = join(here, '../results/apps-history.jsonl')
const work = process.env.BENCH_WORK ?? join(homedir(), '.cache/weft-app-bench'), store = join(work, 'store')
const runs = +opt.runs, buildRuns = +opt['build-runs']

const targets = opt.all ? allApps() : positionals
if (!targets.length) { console.error('usage: node bench.mjs <app>... | --all   (see the top of this file)'); process.exit(1) }
const apps = targets.map(loadApp)
if (opt.detect) {
  for (const a of apps) for (const v of a.variants) console.log(`${a.name}/${v.name}: ${v.stack.id} (${v.pm}), build \`${v.build}\`, start \`${v.start ?? 'static'}\`, from ${v.path}${v.cwd === '.' ? '' : `/${v.cwd}`}`)
  process.exit(0)
}
if (+process.versions.node.split('.')[0] < 26) { console.error(`weft needs Node 26; this is ${process.version}`); process.exit(1) }
if (loadavg()[0] > BUSY) { console.error(`1-minute load is ${loadavg()[0].toFixed(0)}, over ${BUSY}: numbers would be noise. Run this on another machine.`); process.exit(1) }

/** The sample nearest the median, for what can't be medianed: LCP phases, findings, the resource list. */
const middle = (samples, key) => [...samples].sort((a, b) => a[key] - b[key])[samples.length >> 1]

async function sample(v, server, page, browser, i, keep) {
  const url = server.url + page.path, loads = [loadavg()[0]]
  const first = await assertFresh(v, server)
  const bytes = await bytesPass(browser, url)
  await assertFresh(v, server, bytes.assets)
  const hyd = await hydrationPass(browser, url, page.probe)
  const lh = {}
  for (const form of ['mobile', 'desktop']) {
    lh[form] = await lighthouseRun(url, form, i === 0 ? keep(form) : null)
    await assertFresh(v, server, lh[form].scripts.filter(u => u.startsWith(server.url)).map(u => u.slice(server.url.length)).filter(p => bytes.assets.includes(p) || !/[?]/.test(p)))
    loads.push(loadavg()[0])
  }
  const real = await lighthouseThrottled(url)
  await assertFresh(v, server)
  return { bytes, hyd, lh, real, fresh: first.canary, load: Math.max(...loads) }
}

function summarise(page, samples) {
  const pick = f => spread(samples.map(f)), m = {}
  for (const form of ['mobile', 'desktop']) for (const k of ['score', 'fcp', 'lcp', 'tbt', 'cls', 'si']) m[`${form}.${k}`] = pick(s => s.lh[form][k])
  for (const t of ['js', 'css', 'html', 'font']) for (const c of ['br', 'gz']) m[`bytes.${t}.${c}`] = pick(s => s.bytes.totals[t][c])
  for (const k of ['hydrate', 'script', 'heap', 'nodes', 'elements', 'comments']) m[`browser.${k}`] = pick(s => s.hyd[k])
  m['throttled.lcp'] = pick(s => s.real.lcp); m['throttled.fcp'] = pick(s => s.real.fcp)
  const mid = middle(samples.map(s => ({ ...s.lh.mobile, s })), 'lcp').s, midD = middle(samples.map(s => ({ ...s.lh.desktop, s })), 'lcp').s
  const real = middle(samples.map(s => s.real), 'lcp')
  return {
    metrics: m, method: samples[0].hyd.method, errors: [...new Set(samples.flatMap(s => s.hyd.errors))], lost: { mobile: mid.lh.mobile.lost, desktop: midD.lh.desktop.lost }, lcp: { ...real.lcpInfo, simulated: mid.lh.mobile.simulated },
    findings: mid.lh.mobile.findings, bootupMs: mid.lh.mobile.bootupMs, top: mid.bytes.top.slice(0, 12), assets: mid.bytes.assets, unused: mid.bytes.unusedBr, thirdParty: mid.bytes.thirdParty,
    encoding: mid.bytes.top.find(r => r.type === 'js' || r.type === 'html')?.encoding, fresh: { samples: samples.length, canary: samples.every(s => s.fresh) },
  }
}

async function benchApp(app) {
  const runId = Date.now().toString(36), only = opt.only?.split(','), variants = app.variants.filter(v => !only || only.includes(v.name))
  say(`\n${app.name}: ${variants.map(v => `${v.name} (${v.stack.id})`).join(', ')}; ${app.pages.length} pages, ${runs} runs`)
  const out = {}
  for (const v of variants) {
    say(`  ${v.name}: copying and installing${v.tarballs ? ' on tarballs of this checkout' : ''}`)
    await prepare(app, v, { work, runId, store })
    say(`  ${v.name}: ${buildRuns} cold builds`)
    const build = await buildAll(v, buildRuns)
    out[v.name] = { label: v.label, stack: v.stack.id, family: v.stack.family, pm: v.pm, build, lines: linesOfCode(v), weft: v.weft, pages: {} }
    say(`    ${Math.round(build.med)} ms, ${out[v.name].lines} lines, ${v.fresh.hashes.size} assets fingerprinted`)
  }
  const browser = await launchBrowser(), servers = {}, samples = {}
  try {
    for (const v of variants) { servers[v.name] = await startServer(v, app.pages[0].path); samples[v.name] = Object.fromEntries(app.pages.map(p => [p.path, []])); out[v.name].bootMs = servers[v.name].bootMs }
    // Round-robin, rotating who goes first: drift on a shared machine lands on every variant, not on the last one.
    for (let i = 0; i < runs; i++) {
      for (let k = 0; k < variants.length; k++) {
        const v = variants[(i + k) % variants.length]
        for (const p of app.pages) {
          const keep = form => join(v.dir, `lighthouse${p.path.replace(/\W/g, '_')}-${form}.json`)
          say(`  run ${i + 1}/${runs} ${v.name} ${p.path} (load ${loadavg()[0].toFixed(1)})`)
          samples[v.name][p.path].push(await sample(v, servers[v.name], p, browser, i, keep))
        }
      }
    }
    for (const v of variants) for (const p of app.pages) out[v.name].pages[p.path] = summarise(p, samples[v.name][p.path])
    // Not a static build: its throughput would only be bench's own host.
    if (!opt['no-load']) for (const v of variants.filter(x => x.start)) {
      for (const p of app.pages) {
        const s = [], plain = [], url = servers[v.name].url + p.path
        await loadPass(url, { seconds: 1 }) // warm, not counted
        for (let i = 0; i < runs; i++) { s.push(await loadPass(url)); plain.push(await loadPass(url, { encoding: 'identity', seconds: 3 })) }
        const errors = [...s, ...plain].reduce((n, x) => n + x.errors, 0), m = out[v.name].pages[p.path].metrics
        if (errors) say(`  ${v.name} ${p.path}: ${errors} failed requests under load`)
        m['server.rps'] = spread(s.map(x => x.rps)); m['server.p95'] = spread(s.map(x => x.p95)); m['server.rpsPlain'] = spread(plain.map(x => x.rps))
        out[v.name].pages[p.path].loadErrors = errors; out[v.name].pages[p.path].loadEncoding = s[0].served
      }
      await assertFresh(v, servers[v.name])
      out[v.name].rssMB = rssMB(servers[v.name])
      say(`  ${v.name}: load done`)
    }
  } finally {
    await browser.close()
    for (const s of Object.values(servers)) await s.stop()
  }
  for (const v of variants) {
    const maps = await buildWithMaps(v)
    if (maps) out[v.name].split = attribute(v, maps, out[v.name].pages)
  }
  const state = repoState(), line = { at: new Date().toISOString(), app: app.name, ...state, runs, cores: cpus().length, host: hostname(), loadMax: Math.max(...Object.values(samples).flatMap(p => Object.values(p).flatMap(l => l.map(s => s.load)))) }
  const prev = existsSync(history) ? readFileSync(history, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)).findLast(l => l.app === app.name && Object.keys(l.variants).some(k => k in out)) : null
  const run = { ...line, label: app.label, note: app.note, pages: app.pages.map(p => p.path), baseline: app.baseline, variants: out }
  run.diagnosis = diagnose(run, prev)
  return { run, line: { ...line, variants: Object.fromEntries(Object.entries(out).map(([k, r]) => [k, { label: r.label, stack: r.stack, build: r.build, lines: r.lines, weft: r.weft?.tgz, pages: Object.fromEntries(Object.entries(r.pages).map(([p, x]) => [p, x.metrics])) }])) } }
}

for (const app of apps) {
  const { run, line } = await benchApp(app)
  console.log(report(run))
  if (opt['no-record']) continue
  const all = existsSync(results) ? JSON.parse(readFileSync(results, 'utf8')) : {}
  all[app.name] = run
  writeFileSync(results, JSON.stringify(all, null, 1) + '\n')
  mkdirSync(dirname(history), { recursive: true })
  appendFileSync(history, JSON.stringify(line) + '\n')
  execFileSync(process.execPath, [join(here, 'chart.mjs')], { stdio: 'inherit' })
}
if (!opt['no-record']) say(`\nchart: ${join(here, '../results/apps.html')}`)
