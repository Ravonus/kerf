import { upperMedian as median } from '../../scripts/lib/helpers.mjs'
// Before, after, and the other stacks, on one machine, one page at a time. Every stack gets the same driver
// (shared/driver.js), the same production settings, the same 5 microsecond timer (cross-origin isolated) and fresh
// pages, and the order of the stacks changes each round. Nothing here counts at load above 20.
//   node measure.mjs [--out results.json] [--quick] [--rows] [--no-reactive] [--rounds 3] [--stacks kerf-base,kerf,solid,solid-batch,react]
// CHROME=<path> uses that browser (another machine's Playwright build).
import { execFileSync, execSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cpus } from 'node:os'
import { chromium } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}
const quick = process.argv.includes('--quick')
const out = arg('out', join(here, 'results.json'))
const want = arg('stacks', 'kerf-base,kerf,solid,solid-batch,react')
  .split(',')
  .filter((s) => existsSync(join(here, 'dist', s.replace('-batch', ''))))
const load = () =>
  Number(
    execSync('uptime')
      .toString()
      .match(/load averages?:\s*([\d.]+)/)[1],
  )
const rounds = Number(arg('rounds', quick ? 1 : 3))
const sizes = process.argv.includes('--rows') ? [] : quick ? [1000, 10000] : [1000, 10000, 100000]

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  const file = join(here, 'dist', path.endsWith('/') ? path + 'index.html' : path)
  if (!existsSync(file)) return res.writeHead(404).end()
  res.writeHead(200, {
    'content-type': types[extname(file)] ?? 'application/octet-stream',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-embedder-policy': 'require-corp',
  })
  res.end(readFileSync(file))
}).listen(0, '127.0.0.1')
await new Promise((r) => server.once('listening', r))
const origin = `http://127.0.0.1:${server.address().port}`

const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  args: [
    '--js-flags=--expose-gc',
    '--enable-precise-memory-info',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
  ],
})

async function open(stack) {
  const page = await (
    await browser.newContext({ viewport: { width: 1200, height: 800 } })
  ).newPage()
  page.on('pageerror', (e) => {
    throw e
  })
  const [dir, batch] = stack.endsWith('-batch') ? [stack.slice(0, -6), '?batch'] : [stack, '']
  await page.goto(`${origin}/${dir}/index.html${batch}`)
  await page.waitForFunction(() => window.speed && crossOriginIsolated, null, { polling: 50 })
  return page
}

async function heap(page) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('HeapProfiler.collectGarbage')
  await cdp.send('HeapProfiler.collectGarbage')
  const u = await cdp.send('Runtime.getHeapUsage')
  await cdp.detach()
  return { js: u.usedSize, native: (u.embedderHeapUsedSize ?? 0) + (u.backingStorageSize ?? 0) }
}

const data = {}
const note = (stack, group, name, value) =>
  (((data[stack] ??= {})[group] ??= {})[name] ??= []).push(value)
const shuffled = (list) =>
  list
    .map((v) => [Math.random(), v])
    .sort((a, b) => a[0] - b[0])
    .map((p) => p[1])
const started = load()
const loads = [started]

for (let r = 0; r < rounds; r++) {
  for (const stack of shuffled(want)) {
    for (const n of sizes) {
      const heavy = stack === 'react' && n === 100000
      for (let s = 0; s < (heavy ? 1 : quick ? 2 : 3); s++) {
        const page = await open(stack)
        const before = await heap(page)
        const made = await page.evaluate((n) => window.speed.create(n), n)
        const after = await heap(page)
        note(stack, `create ${n}`, 'script', made.script)
        note(stack, `create ${n}`, 'total', made.total)
        note(stack, `create ${n}`, 'js bytes per cell', (after.js - before.js) / n)
        note(stack, `create ${n}`, 'native bytes per cell', (after.native - before.native) / n)
        if (s === 0) {
          for (const [label, step, opts] of [
            ['every 10th', 10],
            ['every cell', 1],
            ['one cell', n],
          ]) {
            const t = await page.evaluate(
              ([n, step, o]) => window.speed.ticks(n, step, o),
              [n, step, heavy ? { warm: 10, samples: 3 } : quick ? { samples: 5 } : {}],
            )
            note(stack, `update ${n}`, `${label}, ms per tick`, t.perTick)
          }
          note(
            stack,
            `create ${n}`,
            'dispose',
            await page.evaluate(() => window.speed.unmountTimed()),
          )
        }
        await page.context().close()
      }
    }
    const page = await open(stack)
    for (const op of [
      'create',
      'replace',
      'update',
      'select',
      'swap',
      'remove',
      'runLots',
      'append',
      'clear',
      'small',
    ]) {
      const v = await page.evaluate(
        ([op, o]) => window.speed.rows(op, o),
        [op, quick ? { warm: 3, samples: 5 } : {}],
      )
      if (!v) continue
      note(stack, 'rows script', op, v.script)
      note(stack, 'rows total', op, v.total)
    }
    await page.context().close()
    const mem = await open(stack)
    const before = await heap(mem)
    await mem.evaluate(() => window.speed.run())
    const after = await heap(mem)
    await mem.evaluate(() => window.speed.run())
    note(stack, 'rows memory', 'js bytes per row, 1000 rows', (after.js - before.js) / 1000)
    note(
      stack,
      'rows memory',
      'native bytes per row, 1000 rows',
      (after.native - before.native) / 1000,
    )
    await mem.context().close()
    loads.push(load())
    console.log(`round ${r + 1}: ${stack} done, load ${loads.at(-1)}`)
  }
}
await browser.close()
server.close()

const summary = {}
for (const [stack, groups] of Object.entries(data)) {
  summary[stack] = {}
  for (const [g, names] of Object.entries(groups)) {
    summary[stack][g] = {}
    for (const [k, list] of Object.entries(names))
      summary[stack][g][k] = +median(list).toPrecision(4)
  }
}

const reactive = {}
if (!process.argv.includes('--no-reactive')) {
  for (const lib of new Set([...want.map((s) => s.replace('-batch', '')), 'alien'])) {
    if (!existsSync(join(here, 'dist/reactive', `${lib}.mjs`))) continue
    const text = execFileSync(
      process.execPath,
      ['--expose-gc', join(here, 'reactive.mjs'), lib, '--rounds', quick ? '5' : '9'],
      { encoding: 'utf8' },
    )
    reactive[lib] = JSON.parse(text.trim().split('\n').at(-1))
    loads.push(load())
    console.log(`reactive ${lib} done, load ${loads.at(-1)}`)
  }
}

/** The median's 95% interval, by resampling the runs. */
const rng = (
  (seed) => () =>
    (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296
)(1)
const resample = (list) => list.map(() => list[Math.floor(rng() * list.length)])
const interval = (values, n = 2000) => {
  const sorted = values.sort((a, b) => a - b)
  return [sorted[Math.floor(n * 0.025)], sorted[Math.floor(n * 0.975)]]
}
const spread = {}
for (const [stack, groups] of Object.entries(data)) {
  spread[stack] = {}
  for (const [g, names] of Object.entries(groups)) {
    spread[stack][g] = {}
    for (const [k, list] of Object.entries(names))
      spread[stack][g][k] = {
        runs: list.length,
        ci: interval(Array.from({ length: 2000 }, () => median(resample(list)))).map(
          (v) => +v.toPrecision(4),
        ),
      }
  }
}
/** `a / b` for each number both have, with its 95% interval: below 1 throughout is a win that held across runs. */
const versus = (a, b) => {
  const out = {}
  for (const [g, names] of Object.entries(data[a] ?? {})) {
    for (const [k, list] of Object.entries(names)) {
      const other = data[b]?.[g]?.[k]
      if (!other) continue
      const [lo, hi] = interval(
        Array.from({ length: 2000 }, () => median(resample(list)) / median(resample(other))),
      )
      ;(out[g] ??= {})[k] = {
        ratio: +(median(list) / median(other)).toFixed(4),
        lo: +lo.toFixed(4),
        hi: +hi.toFixed(4),
      }
    }
  }
  return out
}
const against = data['solid-batch'] ? 'solid-batch' : 'solid'
const compared = Object.fromEntries(
  Object.keys(data)
    .filter((s) => s !== against)
    .map((s) => [s, versus(s, against)]),
)
const paths = Object.fromEntries(
  Object.keys(data)
    .filter((s) => s.startsWith('off-'))
    .map((s) => [s, versus(s, 'kerf')]),
)

const results = {
  spread,
  compared,
  paths,
  when: new Date().toISOString(),
  machine: cpus()[0].model,
  node: process.version,
  solid: '1.9.7',
  loads,
  maxLoad: Math.max(...loads),
  valid: Math.max(...loads) < 20,
  grid: summary,
  reactive,
}
writeFileSync(out, JSON.stringify(results, null, 1) + '\n')
console.log(`wrote ${out}; load ${Math.min(...loads)} to ${Math.max(...loads)}`)
