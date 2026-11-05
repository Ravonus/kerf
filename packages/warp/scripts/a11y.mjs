// The a11y suite: axe-core (WCAG 2.0–2.2 A/AA + best practice, color-contrast included) in Chromium at every dial
// stop, expression quiet/balanced/vivid × theme light/dark × motion full/reduce, over each site's interaction states.
// At motion "reduce" it also fails any loop still running that moves anything but opacity (00 §8: under reduced motion
// every animation runs at most once and spinners become an opacity pulse).
//
// One WCAG exemption is applied to axe's color-contrast results: text inside a disabled control (03 §2: a disabled
// field is 50% opacity as a whole, hint and message included) is "part of an inactive user interface component"
// (1.4.3), which axe only knows for the control's own text.
//
//   node scripts/a11y.mjs                         the gallery (test/a11y: every component, fixtures/Variants.tsx)
//   node scripts/a11y.mjs shop=<dist dir> [--json] also a built v3 shop (evals/gates/warp-exit.mjs builds and passes it)
//   node scripts/a11y.mjs --stop=quiet/dark/full   one stop, while fixing what it finds
//
// Exit 1 on any violation, page error or motion leak.
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { jobs, pool } from '../../../scripts/jobs.mjs'

import { auditState } from './a11y-audit.mjs'
import { SCENARIOS } from './a11y-scenarios.mjs'
import { scenes } from '../test/a11y/scenes/index.mjs'

export { scenes }
export { pixelContrast } from './a11y-contrast.mjs'

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(pkg, 'package.json'))

export const STOPS = ['quiet', 'balanced', 'vivid'].flatMap((expression) =>
  ['light', 'dark'].flatMap((theme) =>
    ['full', 'reduce'].map((motion) => ({ expression, theme, motion })),
  ),
)

/** Build the gallery page (test/a11y) into a temp dir; returns the dist dir. */
// The stops are set from outside the build, so purging can't see them.
export const DIALS = [
  'quiet',
  'balanced',
  'vivid',
  'classic',
  'floating',
  'compact',
  'cozy',
  'comfortable',
  'sweep',
  'none',
  'phone',
  'tablet',
  'desktop',
]

export async function buildGallery(outDir) {
  const { build } = await import('vite')
  const { default: weft } = await import('@weft-js/core/vite')
  await build({
    root: join(pkg, 'test', 'a11y'),
    base: './',
    logLevel: 'silent',
    plugins: [weft({ purge: { keep: DIALS } })],
    build: { outDir, emptyOutDir: true },
  })
  return outDir
}

/**
 * Contrast failures that are in the spec's own CSS (docs/design/warp/tokens, split verbatim into warp-core/styles), so
 * warp can't fix them without changing the spec. They are reported, not failed; anything else fails. The spec's a11y
 * review names the class (reviews/03 m12: small text under 4.5:1, fix with the subtle or text tokens). The chip and
 * segmented counts (opacity .7/.8, 3.2:1 and 4.0:1 in light) were fixed in the spec on 2026-10-30.
 *
 * `expression` and `state` narrow an entry to one look and one audit, so it can't excuse the same part anywhere else.
 */
const OVER_TITLE =
  "the open event card's vivid hard shadow lies across another event's title, and the card covers it anyway: the overlay check only tests the box's centre (test/a11y/evidence/schedule-card-over-title.png)"
export const SPEC_FINDINGS = ['light', 'dark'].map((theme) => ({
  where: 'calendar/event-title',
  theme,
  expression: 'vivid',
  state: 'schedule event card',
  why: OVER_TITLE,
}))
const known = (m, stop, label) =>
  SPEC_FINDINGS.find(
    (f) =>
      f.where === m.where &&
      f.theme === stop.theme &&
      (!f.expression || f.expression === stop.expression) &&
      (!f.state || f.state === label),
  )

const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}
const serve = (dir) =>
  new Promise((ok) => {
    const s = createServer((q, r) => {
      let p = join(dir, decodeURIComponent(q.url.split('?')[0]))
      if (!existsSync(p) || p.endsWith('/')) p = join(dir, 'index.html')
      r.writeHead(200, { 'content-type': types[extname(p)] ?? 'application/octet-stream' })
      r.end(readFileSync(p))
    }).listen(0, '127.0.0.1', () => ok(s))
  })

/** Run every site at every stop. `sites` is [{ name, dir }] with name a SCENARIOS key. */
export async function a11y(sites, { log = () => {}, only, workers = jobs() } = {}) {
  const { chromium } = require('playwright-core')
  const axe = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
  // A browser per worker: runs share nothing, and each measures its contrasts one screenshot at a time.
  const browsers = []
  const servers = []
  try {
    const tasks = []
    for (const { name, dir } of sites) {
      const server = await serve(dir)
      servers.push(server)
      const url = `http://127.0.0.1:${server.address().port}/`
      for (const stop of only
        ? STOPS.filter((s) => `${s.expression}/${s.theme}/${s.motion}` === only)
        : STOPS)
        tasks.push({ name, url, stop })
    }
    const pending = tasks.length
    log(`${pending} runs, ${Math.min(workers, pending)} at a time (--jobs or WEFT_JOBS sets this)`)
    const runs = await pool(tasks, workers, (task) =>
      runTask(task, { browsers, chromium, axe, log }),
    )
    const audits = runs.reduce((n, r) => n + r.states.length, 0)
    const failed = runs.filter(
      (r) => r.errors.length || r.states.some((s) => s.violations.length || s.moving.length),
    )
    const spec = SPEC_FINDINGS.map((f) => ({
      ...f,
      stops: runs
        .filter((r) => r.states.some((s) => s.spec.some((m) => m.where === f.where)))
        .map((r) => `${r.site}:${r.expression}/${r.theme}/${r.motion}`),
    })).filter((f) => f.stops.length)
    return {
      ok: failed.length === 0,
      stops: STOPS.length,
      runs: runs.length,
      audits,
      failed: failed.length,
      measured: runs.reduce((n, r) => n + r.states.reduce((k, s) => k + s.measured.length, 0), 0),
      spec,
      results: runs,
    }
  } finally {
    await Promise.all(browsers.map((b) => b.close()))
    for (const server of servers) server.close()
  }
}

async function runTask({ name, url, stop }, { browsers, chromium, axe, log }) {
  const browser = browsers.pop() ?? (await chromium.launch())
  const context = await browser.newContext({
    colorScheme: stop.theme,
    reducedMotion: stop.motion === 'reduce' ? 'reduce' : 'no-preference',
  })
  // the dials live on <html> before any script runs, as an app's server render puts them
  await context.addInitScript((s) => {
    const set = () => Object.assign(document.documentElement.dataset, s)
    if (document.documentElement) set()
    else document.addEventListener('readystatechange', set, { once: true })
  }, stop)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  const states = []
  const audit = (label) => auditState({ page, label, axe, stop, states, known })

  try {
    await SCENARIOS[name](page, audit, url)
  } catch (e) {
    errors.push(`scenario: ${String(e).split('\n')[0]}`)
  }
  const run = { site: name, ...stop, errors, states }
  const bad = states.filter((s) => s.violations.length || s.moving.length)
  log(
    `${name} ${stop.expression}/${stop.theme}/${stop.motion}: ${states.length} audits${bad.length || errors.length ? `, FAIL ${[...bad.map((s) => `[${s.label}] ${[...s.violations.map((v) => `${v.id}×${v.nodes.length}`), ...s.moving.map((m) => `moving: ${m}`)].join(', ')}`), ...errors].join('; ')}` : ', clean'}`,
  )
  await context.close()
  browsers.push(browser)
  return run
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const json = process.argv.includes('--json')
  const extra = process.argv
    .slice(2)
    .filter((a) => a.includes('=') && !a.startsWith('--'))
    .map((a) => {
      const [name, dir] = a.split('=')
      return { name, dir }
    })
  const gallery = await buildGallery(mkdtempSync(join(tmpdir(), 'warp-a11y-')))
  const r = await a11y(
    [
      { name: 'gallery', dir: gallery },
      { name: 'charts', dir: gallery },
      ...Object.keys(scenes).map((name) => ({ name, dir: gallery })),
      ...extra,
    ],
    {
      log: json ? () => {} : (l) => console.error(l),
      only: process.argv.find((a) => a.startsWith('--stop='))?.slice(7),
    },
  )
  if (json) console.log(JSON.stringify(r, null, 2))
  else {
    for (const f of r.spec)
      console.error(`spec finding ${f.where} (${f.theme}, ${f.stops.length} runs): ${f.why}`)
    console.error(
      `${r.runs} runs, ${r.audits} audits, ${r.measured} contrasts measured from pixels: ${r.ok ? 'all clean' : `${r.failed} runs failed`}`,
    )
  }
  process.exit(r.ok ? 0 : 1)
}
