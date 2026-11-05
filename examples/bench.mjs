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
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, loadavg } from 'node:os'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
import { allApps, here, historyFile as history, loadApp } from './lib/app.mjs'
import { cpuBusy, jobs as defaultJobs } from '../scripts/jobs.mjs'
import { report } from './lib/diagnose.mjs'
import { benchApp } from './bench/run.mjs'

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
const results = join(here, 'results.json')
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

for (const app of apps) {
  const { run, line } = await benchApp(app, {
    opt,
    say,
    work,
    store,
    samplesWanted,
    buildRuns,
    jobs,
    load,
  })
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
