// text.measure@1 conformance in a real browser (research 33 §6): both engines must pass, and three bad providers must
// fail, or the suite proves nothing.
//   node test/conformance.mjs <chrome|webkit>      (npm run build first)
import { chromium, webkit } from 'playwright-core'
import * as esbuild from 'esbuild'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = resolve(here, '..')
const engine = pkg
const dist = join(engine, 'dist')
const browserName = process.argv[2] ?? 'chrome'
if (!existsSync(join(dist, 'index.js'))) { console.error('build this package first: npm run build'); process.exit(1) }

const inter = join(pkg, 'node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2')
const entry = `
import * as P from '@chenglou/pretext'
import { textMeasureSuite } from ${JSON.stringify(resolve(pkg, '../weft/src/test-plugins.ts'))}
import { makeCorpus } from ${JSON.stringify(join(engine, 'test/accuracy/corpus.js'))}
window.P = P; window.suite = textMeasureSuite; window.makeCorpus = makeCorpus
`
const bundle = (await esbuild.build({ stdin: { contents: entry, resolveDir: pkg, loader: 'ts' }, bundle: true, format: 'iife', write: false, define: { 'import.meta.env': '{}' }, nodePaths: [join(pkg, 'node_modules')] })).outputFiles[0].text

const page_ = `
const opts = () => ({
  corpora: [
    { name: 'latin', texts: makeCorpus('latin', N) },
    { name: 'emoji', texts: makeCorpus('emoji', N) },
    { name: 'arabic', texts: makeCorpus('arabic', N) },
    { name: 'cjk', texts: makeCorpus('cjk', N), allow: 0.005 },
  ],
  webFont: { family: 'ConfInter', url: '/inter.woff2' },
  budgets: BUDGETS,
})
const pretext = {
  prepare: (t, f, o) => Object.assign(P.prepareWithSegments(t, f, o), { exact: true, ready: null }),
  layout: (h, w, l) => P.layout(h, w, l),
  lines: (h, w) => P.layoutWithLines(h, w, 1).lines,
  lineText: (_, l) => l.text,
  clear: P.clearCache,
}
const bad = {
  // Counts characters instead of measuring.
  guesses: { ...pretext, layout: (h, w, l) => { const n = Math.ceil(h.segments.join('').length * 7 / w); return { height: n * l, lineCount: n } } },
  // Right answers, read from the DOM.
  impure: { ...pretext, layout(h, w, l) { document.body.offsetHeight; return P.layout(h, w, l) } },
  // Never lets go of the widths it measured on the fallback.
  stale: (() => { const seen = new Map(); return { ...pretext, prepare(t, f, o) { const k = t + o?.segments; if (!seen.has(k)) seen.set(k, pretext.prepare(t, f.replace('"ConfInter"', 'Arial'), o)); return seen.get(k) }, clear() {} } })(),
}
window.runSlim = async () => suite(await (await import('/${browserName === 'webkit' ? 'webkit' : 'blink'}/engine.js')).engine, opts())
window.runPretext = () => suite(pretext, opts())
window.runBad = name => suite(bad[name], opts())
`
const budgets = process.env.WEFT_LOADED ? '{ layout: 5, prepare: 150 }' : '{}'
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><body style="margin:0"><script>${bundle}</script><script>const N=${process.env.N ?? 1000},BUDGETS=${budgets};${page_}</script></body></html>`

const webkitPath = () => {
  const root = join(process.env.HOME, 'Library/Caches/ms-playwright')
  const dir = readdirSync(root).filter(d => d.startsWith('webkit-')).sort().at(0)
  return process.env.WEBKIT_PATH ?? join(root, dir, 'pw_run.sh')
}
const browser = browserName === 'webkit' ? await webkit.launch({ headless: true, executablePath: webkitPath() }) : await chromium.launch({ channel: 'chrome', headless: true })
const fresh = async () => {
  const ctx = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1200, height: 900 } })
  const page = await ctx.newPage()
  page.on('pageerror', e => console.error('[pageerror]', e.message))
  await page.route('http://te.test/**', r => {
    const u = new URL(r.request().url())
    if (u.pathname === '/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: html })
    if (u.pathname === '/inter.woff2') return r.fulfill({ contentType: 'font/woff2', body: readFileSync(inter) })
    const f = join(dist, u.pathname)
    return existsSync(f) ? r.fulfill({ contentType: 'text/javascript; charset=utf-8', body: readFileSync(f) }) : r.fulfill({ status: 404 })
  })
  await page.goto('http://te.test/')
  return page
}

let failed = false
const show = (name, checks) => {
  console.log(`\n${browserName} ${browser.version()}: ${name}`)
  for (const c of checks) console.log(`  ${c.ok ? 'ok  ' : 'FAIL'} ${c.name}: ${c.detail}`)
}
for (const [name, fn] of [['slim', 'runSlim'], ['pretext', 'runPretext']]) {
  const checks = await (await fresh()).evaluate(f => window[f](), fn)
  show(name, checks)
  if (checks.some(c => !c.ok)) failed = true
}
const expected = { guesses: 'accuracy: latin', impure: 'purity: layout reads no DOM', stale: 'fonts: after clear(), results match the real face' }
for (const [name, must] of Object.entries(expected)) {
  const checks = await (await fresh()).evaluate(b => window.runBad(b), name)
  const hit = checks.find(c => c.name === must)
  console.log(`\nbad provider \`${name}\`: ${hit && !hit.ok ? 'caught' : 'NOT CAUGHT'} by "${must}" (${hit?.detail})`)
  if (!hit || hit.ok) failed = true
}
await browser.close()
process.exit(failed ? 1 : 0)
