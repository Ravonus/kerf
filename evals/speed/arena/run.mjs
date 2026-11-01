// The arena's "time per update", taken apart: at 60 Hz and flat out, with and without the harness's observer, and with
// text writes muted. Each row is a fresh page with three frames, in the slot the subject has on the site.
//   node run.mjs --rounds 3 --ticks 1200 [--subjects weft,raw] [--out arena.json]
//   --as-is: 60 Hz with the meter untouched only. --plain: no cross-origin isolation, so the clock is as coarse as the site's.
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d }
const dist = process.env.DIST ?? join(here, '../dist/arena')
const rounds = +arg('rounds', 3), ticks = +arg('ticks', 1200), hard = +arg('tight', 4000)
const subjects = arg('subjects', 'weft,raw').split(',')
const others = arg('others', 'solid,react')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  const plain = url.searchParams.get('plain') === '1' || (req.headers.referer ?? '').includes('plain=1')
  try {
    const body = await readFile(join(dist, url.pathname === '/' ? 'index.html' : url.pathname))
    res.writeHead(200, { 'content-type': types[extname(url.pathname)] ?? 'text/html', ...(plain ? {} : { 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp' }) })
    res.end(body)
  } catch { res.writeHead(404); res.end() }
}).listen(0, '127.0.0.1')
await new Promise(ok => server.on('listening', ok))
const port = server.address().port
const browser = await chromium.launch({ headless: true })
const shapes = [['all', 1, 1], ['no observer', 0, 1], ['no observer, muted', 0, 0]].slice(0, argv.includes('--as-is') ? 1 : 3)
const modes = arg('modes')?.split(',') ?? (argv.includes('--as-is') ? ['hz'] : ['hz', 'tight'])
const plain = argv.includes('--plain') ? '&plain=1' : ''
const plans = []
for (let r = 0; r < rounds; r++) for (const subject of subjects) for (const mode of modes) for (const [shape, obs, write] of shapes) plans.push({ r, subject, mode, shape, obs, write })
plans.sort((a, b) => a.r - b.r || Math.random() - .5)
const rows = []
for (const p of plans) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 400 } })
  const n = p.mode === 'tight' ? hard : ticks
  await page.goto(`http://127.0.0.1:${port}/?frames=${p.subject},${others}&mode=${p.mode}&obs=${p.obs}&write=${p.write}&ticks=${n}&skip=120${plain}`)
  await page.waitForFunction('window.result', null, { timeout: 600000, polling: 500 })
  const result = await page.evaluate('window.result')
  await page.close()
  rows.push({ ...p, ...result })
  const s = result.stacks.map(s => `${s.name} ${(s.mean * 1000).toFixed(1)}us`).join(' ')
  console.log(p.r, p.subject, p.mode, p.shape, s, `iso=${result.isolated} paint/s=${(result.paints / result.seconds).toFixed(0)}`)
}
await browser.close()
server.close()
const median = a => { a = [...a].sort((x, y) => x - y); return a.length % 2 ? a[a.length >> 1] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2 }
const table = {}
for (const row of rows) for (const s of row.stacks) ((table[`${row.subject}|${row.mode}|${row.shape}`] ??= {})[s.name] ??= []).push(s.mean * 1000)
console.log('\nmedian of round means, us per update')
for (const [k, v] of Object.entries(table).sort()) console.log(k.padEnd(40), Object.entries(v).map(([n, a]) => `${n} ${median(a).toFixed(1)} (${a.map(x => x.toFixed(0)).join(',')})`).join('  '))
await writeFile(arg('out', 'arena.json'), JSON.stringify(rows, null, 1))
