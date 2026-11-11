// The stack-neutral design audit behind `evals/gates/ds-exit.mjs` (PLAN §9 Phase 4) and measure.mjs: it reads only the built
// page in Chromium, so it can't tell kerf from React. Every screen of the brief, in light and dark, at 1280 and 390.
//
//   a11y         axe (WCAG 2.0–2.2 A/AA + best practice) nodes, split by contrast and everything else, over the resting
//                screens and two states (the invalid form, the open dialog); keyboard focus with no visible change;
//                sideways scroll at 390
//   consistency  distinct computed values across the screens, by kind, and "drift": how many different looks each role
//                (primary button, input, h1, h2, table row, nav link) has
//   brief        does the page do what the brief asked, by role and text only
//
// What it can't see: whether the page looks good (nothing here judges that), and contrast over images or gradients
// (axe marks those incomplete, and they aren't counted).
import { auditContexts } from './audit/contexts.mjs'
import { brief } from './audit/brief.mjs'
import { focusLoss, collect } from './audit/inspect.mjs'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync, constants } from 'node:zlib'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(join(here, '../../../packages/veneer/package.json'))
export const { chromium } = require('playwright-core')
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const RULES = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
}

function serve(dir) {
  return new Promise((ok) => {
    const s = createServer((req, res) => {
      const path = join(dir, new URL(req.url, 'http://x').pathname)
      const file = existsSync(path) && statSync(path).isFile() ? path : join(dir, 'index.html')
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
      res.end(readFileSync(file))
    }).listen(0, '127.0.0.1', () => ok(s))
  })
}

const settle = (page) =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 450))))

async function show(page, url, screen) {
  await page.goto(`${url}#/${screen}`)
  await page.waitForLoadState('load')
  await settle(page)
}

async function axe(page) {
  await page.evaluate(AXE)
  const r = await page.evaluate(
    (rules) => globalThis.axe.run(document, { runOnly: { type: 'tag', values: rules } }),
    RULES,
  )
  return r.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.length,
    target: v.nodes[0]?.target?.join(' '),
  }))
}

const merge = (into, from) => {
  for (const [k, vs] of Object.entries(from.values))
    for (const [v, n] of Object.entries(vs))
      (into.values[k] ??= {})[v] = (into.values[k][v] ?? 0) + n
  for (const [k, list] of Object.entries(from.roles)) (into.roles[k] ??= []).push(...list)
}

/** Audit one built app. */
export async function audit(browser, dist) {
  const server = await serve(dist)
  const url = `http://127.0.0.1:${server.address().port}/`
  const out = {
    axe: 0,
    contrast: 0,
    serious: 0,
    byRule: {},
    focusStops: 0,
    focusInvisible: 0,
    overflow: 0,
    darkFollows: 0,
    errors: [],
  }
  const collected = { values: {}, roles: {} }
  await auditContexts(browser, url, out, collected, {
    show,
    settle,
    axe,
    focusLoss,
    collect,
    merge,
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  out.brief = await brief(page, url, show, settle)
  await page.close()
  server.close()

  const distinct = Object.fromEntries(
    Object.entries(collected.values).map(([k, v]) => [k, Object.keys(v).length]),
  )
  const drift = Object.fromEntries(
    Object.entries(collected.roles).map(([k, v]) => [k, new Set(v).size]),
  )
  const a = {
    axe: out.axe,
    contrast: out.contrast,
    serious: out.serious,
    byRule: out.byRule,
    focusStops: out.focusStops,
    focusInvisible: out.focusInvisible,
    overflow: out.overflow,
    darkFollows: out.darkFollows,
    distinct,
    distinctTotal: Object.values(distinct).reduce((a, b) => a + b, 0),
    drift,
    driftTotal: Object.values(drift).reduce((a, b) => a + b, 0),
    looks: Object.fromEntries(
      Object.entries(collected.roles).map(([k, v]) => [k, [...new Set(v)]]),
    ),
    brief: out.brief,
    briefPassed: Object.values(out.brief).filter(Boolean).length,
    briefTotal: Object.keys(out.brief).length,
    errors: [...new Set(out.errors)].slice(0, 5),
    bytes: bytes(dist),
  }
  return a
}

const br = (b) => brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length
function bytes(dist) {
  const out = { js: 0, css: 0 }
  const walk = (dir) => {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, f.name)
      if (f.isDirectory()) walk(p)
      else if (f.name.endsWith('.js')) out.js += br(readFileSync(p))
      else if (f.name.endsWith('.css')) out.css += br(readFileSync(p))
    }
  }
  walk(dist)
  return out
}
