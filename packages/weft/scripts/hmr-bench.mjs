// HMR gate, end to end (PLAN §3.7: 1k components ≤ 50 ms p95 from Vite's change event to DOM updated; research 21).
// Generates a 1k-component app, serves it with Vite + weft(), opens it in headless Chromium, then edits one
// component file at a time and times Vite's watcher `change` event (and the file write) → MutationObserver sees
// the edited text. Exits 1 when the gated p95 is over budget.
//
//   node scripts/hmr-bench.mjs [--edits 60] [--json out.json]
//
// Needs playwright-core and a Playwright Chromium: `PLAYWRIGHT_CORE=/path/to/playwright-core` when it isn't
// resolvable from here.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createServer } from 'vite'
import weft from '../vite.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = join(here, '..')
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback }
const N = Number(arg('--components', 1000))
const EDITS = Number(arg('--edits', 60))

const pw = process.env.PLAYWRIGHT_CORE
  ? await import(pathToFileURL(createRequire(join(process.env.PLAYWRIGHT_CORE, 'x')).resolve('playwright-core')).href)
  : await import('playwright-core')
const { chromium } = pw.default ?? pw

const root = join(tmpdir(), `weft-hmr-bench-${process.pid}`)
mkdirSync(join(root, 'src'), { recursive: true })
const comp = (i, label) => `import { state } from 'weft'
export function C${i}(props: { label: string }) {
  const count = state(${i})
  return <li onClick={() => count.value++}><b>${label}</b> {props.label} {count.value}</li>
}
`
for (let i = 0; i < N; i++) writeFileSync(join(root, 'src', `C${i}.tsx`), comp(i, `c${i}`))
writeFileSync(join(root, 'src', 'App.tsx'),
  Array.from({ length: N }, (_, i) => `import { C${i} } from './C${i}.tsx'`).join('\n') +
  `\nexport function App() { return <ul>${Array.from({ length: N }, (_, i) => `<C${i} label="x" />`).join('')}</ul> }\n`)
writeFileSync(join(root, 'src', 'main.tsx'), `import { render } from 'weft/dom'\nimport { App } from './App.tsx'\nrender(() => <App />, document.getElementById('root')!)\n`)
writeFileSync(join(root, 'index.html'), `<!doctype html><div id="root"></div><script type="module" src="/src/main.tsx"></script>`)

const server = await createServer({
  root,
  configFile: false,
  logLevel: 'error',
  plugins: [weft()],
  resolve: { alias: [{ find: /^weft\/(dom|hmr)$/, replacement: join(pkg, 'src/$1.ts') }, { find: /^weft$/, replacement: join(pkg, 'src/index.ts') }] },
  server: { port: 0, fs: { allow: [root, pkg] } },
})
await server.listen()
// When Vite's watcher reports the change: on macOS that alone is ~90 ms after the write, at any app size.
let changed = 0
server.watcher.on('change', () => { changed ||= performance.now() })
const browser = await chromium.launch()
const total = [], afterWatcher = []
try {
  const page = await browser.newPage()
  let resolveSeen
  await page.exposeFunction('__seen', () => resolveSeen?.())
  const t0 = performance.now()
  await page.goto(server.resolvedUrls.local[0])
  await page.waitForFunction(n => document.querySelectorAll('li').length === n, N, { timeout: 120_000 })
  const cold = performance.now() - t0
  for (let r = 0; r < EDITS + 5; r++) {
    const i = (r * 397 + 11) % N
    const text = `edit${r}`
    await page.evaluate(([i, text]) => {
      const ul = document.querySelector('ul')
      const mo = new MutationObserver(() => {
        if (ul.children[i]?.firstChild?.textContent === text) { mo.disconnect(); window.__seen() }
      })
      mo.observe(ul, { childList: true, subtree: true, characterData: true })
    }, [i, text])
    const seen = new Promise(r => (resolveSeen = r))
    changed = 0
    const start = performance.now()
    writeFileSync(join(root, 'src', `C${i}.tsx`), comp(i, text))
    await seen
    const end = performance.now()
    if (r >= 5) { // the first edits warm the watcher and module graph
      total.push(end - start)
      afterWatcher.push(end - changed)
    }
    const kept = await page.evaluate(i => document.querySelector('ul').children[i].textContent, i)
    if (!kept.endsWith(` x ${i}`)) throw new Error(`state lost on edit ${r}: ${kept}`)
  }
  const reloads = await page.evaluate(() => performance.getEntriesByType('navigation').length)
  const stats = xs => {
    const s = [...xs].sort((a, b) => a - b), p = q => +s[Math.min(s.length - 1, Math.floor(q * s.length))].toFixed(1)
    return { p50: p(0.5), p95: p(0.95), max: +s.at(-1).toFixed(1) }
  }
  const result = { components: N, edits: total.length, coldMs: Math.round(cold), reloads, writeToDom: stats(total), watcherToDom: stats(afterWatcher) }
  const line = s => `p50 ${s.p50} ms, p95 ${s.p95} ms, max ${s.max} ms`
  console.log(`HMR, ${N} components (Vite dev + headless Chromium), ${result.edits} edits, state kept, ${reloads} page load:`)
  console.log(`  file write → DOM updated:           ${line(result.writeToDom)}`)
  console.log(`  Vite change event → DOM updated:    ${line(result.watcherToDom)}`)
  console.log(`  cold load ${result.coldMs} ms`)
  const out = arg('--json')
  if (out) writeFileSync(out, JSON.stringify(result, null, 2))
  // The gate starts at Vite's change event: the watcher's own latency before it is the OS's and Vite's, not weft's.
  if (result.watcherToDom.p95 > 50) process.exitCode = 1
} finally {
  await browser.close()
  await server.close()
  rmSync(root, { recursive: true, force: true })
}
