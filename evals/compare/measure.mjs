#!/usr/bin/env node
// Weft + warp against the React and Solid kits people ship, on one dashboard (README.md).
//   node measure.mjs                       size, load, parity and DOM work; writes results.json
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

const here = dirname(fileURLToPath(import.meta.url))
const META = Object.fromEntries(readdirSync(here).filter(d => existsSync(join(here, d, 'stack.json'))).map(d => [d, JSON.parse(readFileSync(join(here, d, 'stack.json'), 'utf8'))]))
const STACKS = Object.keys(META).sort((a, b) => META[a].order - META[b].order)
const SWEEP = [1, 10, 50, 200]
const ROWS = [20, 100, 200]
const require = createRequire(join(here, '../../packages/warp/package.json'))
const { chromium } = require('playwright-core')

const build = dir => execFileSync('npx', ['vite', 'build', '--logLevel', 'error'], { cwd: dir, stdio: ['ignore', 'ignore', 'ignore'] })
const br = b => brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length
function sizes(dir) {
  const a = join(dir, 'dist/assets'), out = { js: { raw: 0, gz: 0, br: 0 }, css: { raw: 0, gz: 0, br: 0 } }
  for (const f of readdirSync(a)) {
    const k = f.endsWith('.js') ? 'js' : f.endsWith('.css') ? 'css' : null
    if (!k) continue
    const b = readFileSync(join(a, f))
    out[k].raw += b.length; out[k].gz += gzipSync(b, { level: 9 }).length; out[k].br += br(b)
  }
  return out
}
const lines = dir => {
  const src = join(dir, 'src')
  return readdirSync(src).filter(f => /\.(tsx|ts|css)$/.test(f) && f !== 'screens.ts').reduce((n, f) => n + readFileSync(join(src, f), 'utf8').trim().split('\n').length, 0)
}

// Real per-screen code: its own words, numbers, state and markup, so repeats can't compress away. Same shape per stack.
const WORDS = 'amber basalt cedar dune ember fjord grove heath inlet jade kelp loam marsh nectar opal pine quartz reed sage tundra umber vale willow xenon yarrow zephyr'.split(' ')
const word = (i, k) => `${WORDS[(i * 7 + k) % 26]}-${WORDS[(i * 3 + k * 5) % 26]}-${(i + 1) * (k + 3)}`
const stats = i => [0, 1, 2].map(k => ({ label: word(i, k), at: (i * 13 + k * 29) % 90 + 5 }))
const items = i => [3, 4, 5, 6, 7].map(k => word(i, k))
const SUMMARY = {
  weft: i => `function Summary() {
  const open = state(false), note = state('${word(i, 8)}')
  const stats = ${JSON.stringify(stats(i))}
  return <section aria-label="${word(i, 9)}"><h2>${word(i, 10)}</h2><dl>{stats.map(s => <div key={s.label}><dt>{s.label}</dt><dd>{projects.filter(p => p.used > s.at).length}</dd></div>)}</dl>
    <input aria-label="${word(i, 11)}" value={note.value} onInput={(e: any) => (note.value = e.currentTarget.value)} /><p>{note.value.length} ${word(i, 12)}</p>
    <button type="button" onClick={() => (open.value = !open.value)}>${word(i, 13)}</button>{open.value && <ul>${items(i).map(w => `<li><a href="#${w}">${w}</a></li>`).join('')}</ul>}</section>
}
`,
  solid: i => `function Summary() {
  const [open, setOpen] = createSignal(false), [note, setNote] = createSignal('${word(i, 8)}')
  const stats = ${JSON.stringify(stats(i))}
  return <section aria-label="${word(i, 9)}"><h2>${word(i, 10)}</h2><dl><For each={stats}>{s => <div><dt>{s.label}</dt><dd>{projects.filter(p => p.used > s.at).length}</dd></div>}</For></dl>
    <input aria-label="${word(i, 11)}" value={note()} onInput={e => setNote(e.currentTarget.value)} /><p>{note().length} ${word(i, 12)}</p>
    <button type="button" onClick={() => setOpen(!open())}>${word(i, 13)}</button><Show when={open()}><ul>${items(i).map(w => `<li><a href="#${w}">${w}</a></li>`).join('')}</ul></Show></section>
}
`,
}
SUMMARY.react = i => `function Summary() {
  const [open, setOpen] = useState(false), [note, setNote] = useState('${word(i, 8)}')
  const stats = ${JSON.stringify(stats(i))}
  return <section aria-label="${word(i, 9)}"><h2>${word(i, 10)}</h2><dl>{stats.map(s => <div key={s.label}><dt>{s.label}</dt><dd>{projects.filter(p => p.used > s.at).length}</dd></div>)}</dl>
    <input aria-label="${word(i, 11)}" value={note} onChange={e => setNote(e.currentTarget.value)} /><p>{note.length} ${word(i, 12)}</p>
    <button type="button" onClick={() => setOpen(!open)}>${word(i, 13)}</button>{open && <ul>${items(i).map(w => `<li><a href="#${w}">${w}</a></li>`).join('')}</ul>}</section>
}
`
const IMPORTS = { weft: `import { projects } from '../../../shared/data'\n`, solid: `import { createSignal, For, Show } from 'solid-js'\nimport { projects } from '../../../shared/data'\n`, react: `import { useState } from 'react'\nimport { projects } from '../../../shared/data'\n` }

/** N screens: each its own columns, label and Summary on the stack's shared table, all in the one bundle. */
function sweep(stack, dir, n) {
  const { flavor } = META[stack]
  const src = join(dir, 'src'), screen = readFileSync(join(src, 'Screen.tsx'), 'utf8'), original = readFileSync(join(src, 'screens.ts'), 'utf8')
  rmSync(join(src, 'gen'), { recursive: true, force: true }); mkdirSync(join(src, 'gen'))
  for (let i = 0; i < n; i++) {
    let code = screen.replaceAll("'./", "'../").replaceAll("'../../shared/data'", "'../../../shared/data'").replace("'Projects'", `'${word(i, 14)}'`)
    for (const [k, h] of ['Owner', 'Region', 'Status'].entries()) code = code.replaceAll(new RegExp(`(header|headerName): '${h}'`, 'g'), `$1: '${word(i, 15 + k)}'`)
    code = code.replace(/projects, /, '').replace(/import \{ money, projects, type Project \}/, 'import { money, type Project }')
    code = flavor === 'weft' ? code.replace('<h1>{LABEL}</h1>', '<h1>{LABEL}</h1><Summary />') : code.replace(/=> (<DataTable .*\/>)/, '=> <><Summary />$1</>')
    writeFileSync(join(src, `gen/S${i}.tsx`), IMPORTS[flavor] + code + SUMMARY[flavor](i))
  }
  writeFileSync(join(src, 'screens.ts'), Array.from({ length: n }, (_, i) => `import { Screen as S${i} } from './gen/S${i}'`).join('\n') + `\nexport const screens = [${Array.from({ length: n }, (_, i) => `S${i}`)}]\n`)
  try { build(dir); return sizes(dir) } finally { writeFileSync(join(src, 'screens.ts'), original); rmSync(join(src, 'gen'), { recursive: true, force: true }) }
}

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const serve = dist => new Promise(ok => { const s = createServer((q, r) => { let p = join(dist, q.url.split('?')[0]); if (!existsSync(p) || statSync(p).isDirectory()) p = join(dist, 'index.html'); r.writeHead(200, { 'content-type': types[extname(p)] ?? 'application/octet-stream' }); r.end(readFileSync(p)) }).listen(0, '127.0.0.1', () => ok(s)) })

async function load(browser, url) {
  const runs = []
  for (let i = 0; i < 5; i++) {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Performance.enable'); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await page.goto(url); await page.getByText('Apollo 0', { exact: true }).first().waitFor(); await page.waitForTimeout(300)
    const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]))
    runs.push({ script: m.ScriptDuration * 1000, style: m.RecalcStyleDuration * 1000, layout: m.LayoutDuration * 1000, task: m.TaskDuration * 1000, heap: m.JSHeapUsedSize / 1048576, nodes: m.Nodes,
      fcp: await page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime) })
    await page.context().close()
  }
  const med = k => runs.map(r => r[k]).sort((a, b) => a - b)[2]
  return { scriptMs: +med('script').toFixed(0), styleMs: +med('style').toFixed(0), layoutMs: +med('layout').toFixed(0), taskMs: +med('task').toFixed(0), fcpMs: +med('fcp').toFixed(0), heapMB: +med('heap').toFixed(2), nodes: med('nodes') }
}

// What each stack calls the same control. Everything else is the same script.
const L = {
  filter: { 'react-mui': p => p.getByRole('searchbox') },
  next: { 'react-mui': p => p.getByRole('button', { name: /next page/i }) },
  sort: { 'react-mui': p => p.getByRole('columnheader', { name: 'Budget' }) },
  columns: { 'react-mui': p => p.getByRole('button', { name: /columns/i }).first() },
}
const busy = async cdp => { const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value])); return (m.ScriptDuration + m.RecalcStyleDuration + m.LayoutDuration) * 1000 }
const throttled = async page => { const cdp = await page.context().newCDPSession(page); await cdp.send('Performance.enable'); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); return cdp }
const COUNT = () => { window.__m = 0; new MutationObserver(l => (window.__m += l.reduce((n, r) => n + (r.type === 'childList' ? r.addedNodes.length + r.removedNodes.length : 1), 0))).observe(document, { subtree: true, childList: true, attributes: true, characterData: true }) }
const get = (stack, k, p, d) => (L[k]?.[stack] ?? d)(p)
async function parity(browser, url, stack) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
  page.setDefaultTimeout(5000)
  const errors = []; page.on('pageerror', e => errors.push(String(e)))
  await page.goto(url); await page.getByText('Apollo 0', { exact: true }).first().waitFor()
  await page.evaluate(COUNT)
  const cdp = await throttled(page)
  const out = {}
  const step = async (name, act, check) => {
    try {
      await page.evaluate(() => (window.__m = 0))
      const before = await busy(cdp)
      await act(); await page.waitForTimeout(400)
      const ms = Math.round((await busy(cdp)) - before)
      const dom = await page.evaluate(() => window.__m)
      const ok = await check()
      out[name] = { ok: !!ok, dom, ms }
    } catch (e) { out[name] = { ok: false, error: String(e).slice(0, 140) } }
  }
  const text = () => page.locator('body').innerText()
  await step('live cell', () => page.evaluate(() => window.__tick()), async () => (await text()).includes('$1,001'))
  await step('sort', () => get(stack, 'sort', page, p => p.getByRole('columnheader', { name: /budget/i }).getByRole('button').first()).click(), () => page.getByRole('columnheader', { name: /budget/i }).first().getAttribute('aria-sort').then(v => v === 'ascending' || v === 'descending'))
  await step('next page', () => get(stack, 'next', page, p => p.getByRole('button', { name: /^next/i })).click(), async () => /21[–-]40/.test(await text()))
  await step('filter', () => get(stack, 'filter', page, p => p.getByRole('searchbox').or(p.getByRole('textbox', { name: /filter/i })).first()).fill('Juno'), async () => (await text()).includes('Juno') && !(await text()).includes('Apollo'))
  await step('clear filter', () => get(stack, 'filter', page, p => p.getByRole('searchbox').or(p.getByRole('textbox', { name: /filter/i })).first()).fill(''), async () => true)
  await step('select row', () => page.getByRole('checkbox', { name: /select/i }).nth(1).check({ force: true }), async () => /archive 1/i.test(await text()))
  await step('details open', () => page.getByRole('button', { name: /details for/i }).first().click(), async () => /Region/.test(await page.locator('dl').first().innerText()))
  await step('column picker', async () => { await get(stack, 'columns', page, p => p.getByRole('button', { name: /^columns/i })).click(); await page.waitForTimeout(200); await page.getByRole('menuitemcheckbox', { name: /owner/i }).or(page.locator('[popover] label', { hasText: 'Owner' })).or(page.getByRole('checkbox', { name: /owner/i })).first().click() }, async () => { const gone = (await page.getByRole('columnheader', { name: /owner/i }).count()) === 0; await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); return gone })
  await step('account menu', () => page.getByRole('button', { name: /account|ana ruiz|^AR$/i }).first().click(), async () => /sign out/i.test(await text()))
  await page.context().close()
  return { steps: out, errors }
}

/** The same screen with more rows on the page: what it costs to hold them and to change them. */
async function scale(browser, url, stack) {
  const out = {}
  for (const size of ROWS) {
    if (META[stack].maxRows < size) continue
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
    page.setDefaultTimeout(15000)
    const cdp = await throttled(page), loaded = await busy(cdp)
    await page.goto(`${url}?size=${size}`); await page.getByText('Apollo 0', { exact: true }).first().waitFor(); await page.waitForTimeout(800)
    const load = Math.round((await busy(cdp)) - loaded)
    const dom = await page.evaluate(() => { const w = document.createTreeWalker(document, -1), c = [0, 0, 0]; let n; while ((n = w.nextNode())) c[n.nodeType === 1 ? 0 : n.nodeType === 3 ? 1 : 2]++; return { elements: c[0], text: c[1], comments: c[2], rows: document.querySelectorAll('tbody tr, [role="row"][data-id]').length } })
    await page.evaluate(COUNT)
    const step = async act => { await page.evaluate(() => (window.__m = 0)); const b = await busy(cdp); await act(); await page.waitForTimeout(500); return { ms: Math.round((await busy(cdp)) - b), dom: await page.evaluate(() => window.__m) } }
    out[size] = { load, ...dom,
      live: await step(() => page.evaluate(() => window.__tick())),
      select: await step(() => page.getByRole('checkbox', { name: /select/i }).nth(1).check({ force: true })),
      sort: await step(() => get(stack, 'sort', page, p => p.getByRole('columnheader', { name: /budget/i }).getByRole('button').first()).click()) }
    await page.context().close()
  }
  return out
}

const browser = await chromium.launch()
const results = {}
for (const stack of STACKS) {
  const dir = join(here, stack)
  process.stderr.write(`${stack}\n`)
  build(dir)
  const r = results[stack] = { label: META[stack].label, size: sizes(dir), lines: lines(dir) }
  const s = await serve(join(dir, 'dist')), url = `http://127.0.0.1:${s.address().port}/`
  r.load = await load(browser, url); r.parity = await parity(browser, url, stack); r.scale = await scale(browser, url, stack)
  s.close()
  r.sweep = {}
  for (const n of SWEEP) r.sweep[n] = sweep(stack, dir, n)
  build(dir)
}
await browser.close()
writeFileSync(join(here, 'results.json'), JSON.stringify(results, null, 1) + '\n')
// One line per run, so a chart can follow each stack over time.
const history = join(here, '../results/compare-history.jsonl')
const git = (...a) => execFileSync('git', a, { cwd: here, encoding: 'utf8' }).trim()
appendFileSync(history, JSON.stringify({ at: new Date().toISOString(), commit: git('rev-parse', '--short', 'HEAD'), dirty: !!git('status', '--porcelain', '--', '../../packages'),
  stacks: Object.fromEntries(Object.entries(results).map(([k, r]) => [k, { label: r.label, js: r.size.js.br, css: r.size.css.br, taskMs: r.load.taskMs, fcpMs: r.load.fcpMs }])) }) + '\n')
execFileSync('node', [join(here, 'chart.mjs')], { stdio: 'inherit' })
const kb = n => (n / 1024).toFixed(1)
for (const [k, r] of Object.entries(results)) {
  console.log(`\n${k}: JS ${kb(r.size.js.gz)} gz / ${kb(r.size.js.br)} br, CSS ${kb(r.size.css.gz)} gz / ${kb(r.size.css.br)} br, ${r.lines} lines`)
  console.log(`  load ${JSON.stringify(r.load)}`)
  console.log(`  rows ${Object.entries(r.scale).map(([n, v]) => `${n}: ${v.elements}el ${v.comments}c load ${v.load} live ${v.live.ms}ms/${v.live.dom} select ${v.select.ms}ms/${v.select.dom} sort ${v.sort.ms}ms/${v.sort.dom}`).join(' | ')}`)
  console.log(`  sweep br JS+CSS ${SWEEP.map(n => `${n}: ${kb(r.sweep[n].js.br + r.sweep[n].css.br)}`).join('  ')}`)
  console.log(`  ${Object.entries(r.parity.steps).map(([n, v]) => `${n}: ${v.ok ? 'ok' : 'FAIL'}${v.dom !== undefined ? ` ${v.dom}/${v.ms}ms` : ''}`).join(' | ')}`)
  for (const v of Object.values(r.parity.steps)) if (v.error) console.log('   ', v.error)
  if (r.parity.errors.length) console.log('  errors', r.parity.errors.slice(0, 3))
}
