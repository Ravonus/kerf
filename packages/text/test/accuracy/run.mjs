// Accuracy + diff run against unmodified upstream Pretext and the DOM, in headless Chrome or Playwright WebKit.
//   node test/accuracy/run.mjs <chrome|webkit> [--dist dist] [--out results-<engine>.json] [--corpora a,b] [--reps 7]
// The fork is loaded from dist/<engine>/engine.js over a routed origin, so dynamic pack chunks load as in
// production. Rows: DOM mismatches (|height - DOM| > 0.5px at 320 and 480 px) and line-count diffs against
// upstream at 11 widths.
import { chromium, webkit } from 'playwright-core'
import * as esbuild from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const args = process.argv.slice(2)
const browserName = args[0] ?? 'chrome'
const opt = (k, d) => {
  const i = args.indexOf('--' + k)
  return i < 0 ? d : args[i + 1]
}
const dist = path.resolve(root, opt('dist', 'dist'))
const corpora = opt('corpora', 'latin,latin-hard,emoji,arabic,cjk,thai,mixed').split(',')
const reps = +opt('reps', 1),
  n = +opt('n', 1000)
const family = opt('font', 'Arial')
const fork = opt('engine', browserName === 'webkit' ? 'webkit' : 'blink')
const outFile = path.resolve(root, opt('out', `test/accuracy/results-${browserName}.json`))

const upstream = (
  await esbuild.build({
    stdin: {
      contents: `import * as P from './node_modules/@chenglou/pretext/src/layout.ts'; window.UPSTREAM = P`,
      resolveDir: root,
      loader: 'ts',
    },
    bundle: true,
    format: 'iife',
    write: false,
    minify: true,
  })
).outputFiles[0].text
const pg = (
  await esbuild.build({
    entryPoints: [path.join(here, 'page.js')],
    bundle: true,
    format: 'iife',
    write: false,
  })
).outputFiles[0].text
const browser =
  browserName === 'webkit'
    ? await webkit.launch({
        headless: true,
        executablePath:
          process.env.WEBKIT_PATH ??
          process.env.HOME + '/Library/Caches/ms-playwright/webkit-2336/pw_run.sh',
      })
    : await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({
  deviceScaleFactor: 2,
  viewport: { width: 1200, height: 900 },
})
const page = await ctx.newPage()
page.on('pageerror', (e) => console.error('[pageerror]', e.message))
const fetched = []
await page.route('http://te.test/**', (r) => {
  const u = new URL(r.request().url())
  if (u.pathname === '/')
    return r.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html lang="en"><meta charset="utf-8"><body style="margin:0;-webkit-text-size-adjust:100%"><div id="host"></div><script>${upstream}</script><script>${pg}</script></body></html>`,
    })
  fetched.push(u.pathname)
  const f = path.join(dist, u.pathname)
  return fs.existsSync(f)
    ? r.fulfill({ contentType: 'text/javascript; charset=utf-8', body: fs.readFileSync(f) })
    : r.fulfill({ status: 404 })
})
await page.goto('http://te.test/')
const domWidths = [320, 480],
  widths = [...new Set([...domWidths, 60, 90, 137, 200, 263, 377, 555, 640, 900])]
const libs = { upstream: 'upstream', fork: `http://te.test/${fork}/engine.js` }
const results = { browser: browserName, version: browser.version(), fork, rows: [] }
for (const corpus of corpora) {
  const dom = await page.evaluate((o) => window.domHeights(o), {
    corpus,
    n,
    family,
    size: 16,
    lh: 24,
    widths: domWidths,
  })
  const per = {}
  for (const [name, spec] of Object.entries(libs))
    per[name] = await page.evaluate((o) => window.libHeights(o), {
      lib: spec,
      corpus,
      n,
      family,
      size: 16,
      lh: 24,
      widths,
      reps,
    })
  for (const [name, r] of Object.entries(per)) {
    let domMismatch = 0
    for (const w of domWidths)
      for (let i = 0; i < n; i++) if (Math.abs(r.heights[w][i] - dom[w][i]) > 0.5) domMismatch++
    let diff = 0
    const diffParas = new Set()
    const diffs = []
    if (name !== 'upstream')
      for (const w of widths)
        for (let i = 0; i < n; i++)
          if (r.heights[w][i] !== per.upstream.heights[w][i]) {
            diff++
            diffParas.add(i)
            if (diffs.length < 8)
              diffs.push({
                i,
                w,
                upstream: per.upstream.heights[w][i],
                fork: r.heights[w][i],
                tier: r.tierOf?.[i],
              })
          }
    const row = {
      corpus,
      lib: name,
      domMismatch,
      diffVsUpstream: diff,
      diffParas: diffParas.size,
      prepareCold: +r.prepareCold.toFixed(2),
      prepareWarm: +r.prepareWarm.toFixed(2),
      layout: +r.layout.toFixed(3),
      pulls: r.pulls,
      tiers: r.tiers,
      estimates: r.estimates,
      complexHandles: r.complexHandles,
      ...(diffs.length ? { diffs } : {}),
    }
    results.rows.push(row)
    console.log(JSON.stringify(row))
  }
}
if (!args.includes('--no-lines'))
  for (const corpus of corpora) {
    const r = await page.evaluate((o) => window.linesCheck(o), {
      lib: libs.fork,
      corpus,
      n,
      family,
      size: 16,
      widths,
    })
    results.rows.push({
      corpus,
      lib: 'fork',
      linesChecked: r.checked,
      linesMismatched: r.mismatched,
      ...(r.example ? { linesExample: r.example } : {}),
    })
    console.log(
      JSON.stringify({
        corpus,
        linesChecked: r.checked,
        linesMismatched: r.mismatched,
        example: r.example && JSON.stringify(r.example).slice(0, 400),
      }),
    )
  }
results.chunksFetched = [...new Set(fetched)]
console.log('chunks fetched:', results.chunksFetched.join(' '))
await browser.close()
fs.writeFileSync(outFile, JSON.stringify(results, null, 1))
