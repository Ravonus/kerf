#!/usr/bin/env node
// Weft + warp against the React and Solid kits people ship, on one dashboard (README.md).
//   node measure.mjs                       size, load, parity and DOM work; writes results.json
//   node measure.mjs --long-list           only the long list, writes nothing
import { execFileSync } from 'node:child_process'
import {
  appendFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parity, scale, listResult, longList } from './measure/browser.mjs'
import { build, sizes, lines, sweep } from './measure/build.mjs'
import { historyFile as history } from './history.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const META = Object.fromEntries(
  readdirSync(here)
    .filter((d) => existsSync(join(here, d, 'stack.json')))
    .map((d) => [d, JSON.parse(readFileSync(join(here, d, 'stack.json'), 'utf8'))]),
)
const STACKS = Object.keys(META).sort((a, b) => META[a].order - META[b].order)
const SWEEP = [1, 10, 50, 200]
const ROWS = [20, 100, 200]
const require = createRequire(join(here, '../../packages/warp/package.json'))
const { chromium } = require('playwright-core')

const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
}
const serve = (dist) =>
  new Promise((ok) => {
    const s = createServer((q, r) => {
      let p = join(dist, q.url.split('?')[0])
      if (!existsSync(p) || statSync(p).isDirectory()) p = join(dist, 'index.html')
      r.writeHead(200, { 'content-type': types[extname(p)] ?? 'application/octet-stream' })
      r.end(readFileSync(p))
    }).listen(0, '127.0.0.1', () => ok(s))
  })

async function load(browser, url) {
  const runs = []
  for (let i = 0; i < 5; i++) {
    const page = await (
      await browser.newContext({ viewport: { width: 1280, height: 800 } })
    ).newPage()
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Performance.enable')
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await page.goto(url)
    await page.getByText('Apollo 0', { exact: true }).first().waitFor()
    await page.waitForTimeout(300)
    const m = Object.fromEntries(
      (await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]),
    )
    runs.push({
      script: m.ScriptDuration * 1000,
      style: m.RecalcStyleDuration * 1000,
      layout: m.LayoutDuration * 1000,
      task: m.TaskDuration * 1000,
      heap: m.JSHeapUsedSize / 1048576,
      nodes: m.Nodes,
      fcp: await page.evaluate(
        () => performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
      ),
    })
    await page.context().close()
  }
  const med = (k) => runs.map((r) => r[k]).sort((a, b) => a - b)[2]
  return {
    scriptMs: +med('script').toFixed(0),
    styleMs: +med('style').toFixed(0),
    layoutMs: +med('layout').toFixed(0),
    taskMs: +med('task').toFixed(0),
    fcpMs: +med('fcp').toFixed(0),
    heapMB: +med('heap').toFixed(2),
    nodes: med('nodes'),
  }
}

const browser = await chromium.launch()
const results = {}
if (process.argv.includes('--long-list')) {
  // just this scenario, nothing written
  for (const stack of STACKS) {
    const dir = join(here, stack)
    execFileSync('pnpm', ['exec', 'vite', 'build', '--logLevel', 'error'], {
      cwd: join(dir, 'feed'),
      stdio: ['ignore', 'ignore', 'inherit'],
    })
    const f = await serve(join(dir, 'feed/dist'))
    console.log(
      stack,
      JSON.stringify(
        listResult(dir, await longList(browser, `http://127.0.0.1:${f.address().port}/`)),
      ),
    )
    f.close()
  }
  await browser.close()
  process.exit(0)
}
for (const stack of STACKS) {
  const dir = join(here, stack)
  process.stderr.write(`${stack}\n`)
  build(dir)
  const r = (results[stack] = { label: META[stack].label, size: sizes(dir), lines: lines(dir) })
  const s = await serve(join(dir, 'dist')),
    url = `http://127.0.0.1:${s.address().port}/`
  r.load = await load(browser, url)
  r.parity = await parity(browser, url, stack)
  r.scale = await scale(browser, url, stack, META, ROWS)
  s.close()
  execFileSync('pnpm', ['exec', 'vite', 'build', '--logLevel', 'error'], {
    cwd: join(dir, 'feed'),
    stdio: ['ignore', 'ignore', 'ignore'],
  })
  const f = await serve(join(dir, 'feed/dist'))
  r.longList = listResult(dir, await longList(browser, `http://127.0.0.1:${f.address().port}/`))
  f.close()
  r.sweep = {}
  for (const n of SWEEP) r.sweep[n] = sweep(stack, dir, n, META)
  build(dir)
}
// The design scenario (design/, PLAN Phase 4): the apps a fresh agent built from one brief, re-audited on every run.
const kept = readdirSync(join(here, 'design'), { withFileTypes: true }).filter(
  (d) => d.isDirectory() && existsSync(join(here, 'design', d.name, 'node_modules')),
)
if (kept.length) {
  const { audit } = await import('./design/audit.mjs')
  for (const d of kept) {
    const dir = join(here, 'design', d.name)
    process.stderr.write(`design/${d.name}\n`)
    build(dir)
    const a = await audit(browser, join(dir, 'dist'))
    ;(results[d.name === 'weft-ds' ? 'weft-warp' : d.name] ??= { label: d.name }).design = {
      axe: a.axe,
      contrast: a.contrast,
      distinct: a.distinctTotal,
      drift: a.driftTotal,
      focusLost: a.focusInvisible,
      overflow: a.overflow,
      brief: a.briefPassed,
      briefTotal: a.briefTotal,
      jsCssBr: a.bytes.js + a.bytes.css,
    }
  }
}
await browser.close()
writeFileSync(join(here, 'results.json'), JSON.stringify(results, null, 1) + '\n')
// One line per run, so a chart can follow each stack over time.
const git = (...a) => execFileSync('git', a, { cwd: here, encoding: 'utf8' }).trim()
appendFileSync(
  history,
  JSON.stringify({
    at: new Date().toISOString(),
    commit: git('rev-parse', '--short', 'HEAD'),
    dirty: !!git('status', '--porcelain', '--', '../../packages'),
    stacks: Object.fromEntries(
      Object.entries(results).map(([k, r]) => [
        k,
        {
          label: r.label,
          ...(r.size && {
            js: r.size.js.br,
            css: r.size.css.br,
            taskMs: r.load.taskMs,
            fcpMs: r.load.fcpMs,
            longListBr: r.longList.loadedBr,
            longListJump: r.longList.upJump,
          }),
          ...(r.design && {
            designAxe: r.design.axe,
            designDistinct: r.design.distinct,
            designDrift: r.design.drift,
          }),
        },
      ]),
    ),
  }) + '\n',
)
execFileSync('node', [join(here, 'chart.mjs')], { stdio: 'inherit' })
const kb = (n) => (n / 1024).toFixed(1)
for (const [k, r] of Object.entries(results)) {
  if (r.design) console.log(`\n${k} design: ${JSON.stringify(r.design)}`)
  if (!r.size) continue
  console.log(
    `\n${k}: JS ${kb(r.size.js.gz)} gz / ${kb(r.size.js.br)} br, CSS ${kb(r.size.css.gz)} gz / ${kb(r.size.css.br)} br, ${r.lines} lines`,
  )
  console.log(`  load ${JSON.stringify(r.load)}`)
  console.log(
    `  rows ${Object.entries(r.scale)
      .map(
        ([n, v]) =>
          `${n}: ${v.elements}el ${v.comments}c load ${v.load} live ${v.live.ms}ms/${v.live.dom} select ${v.select.ms}ms/${v.select.dom} sort ${v.sort.ms}ms/${v.sort.dom}`,
      )
      .join(' | ')}`,
  )
  console.log(`  long list ${JSON.stringify(r.longList)}`)
  console.log(
    `  sweep br JS+CSS ${SWEEP.map((n) => `${n}: ${kb(r.sweep[n].js.br + r.sweep[n].css.br)}`).join('  ')}`,
  )
  console.log(
    `  ${Object.entries(r.parity.steps)
      .map(
        ([n, v]) =>
          `${n}: ${v.ok ? 'ok' : 'FAIL'}${v.dom !== undefined ? ` ${v.dom}/${v.ms}ms` : ''}`,
      )
      .join(' | ')}`,
  )
  for (const v of Object.values(r.parity.steps)) if (v.error) console.log('   ', v.error)
  if (r.parity.errors.length) console.log('  errors', r.parity.errors.slice(0, 3))
}
