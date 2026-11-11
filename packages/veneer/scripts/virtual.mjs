// Phase 3c's virtual collections in a real browser, at 10,000 items, on the real text engine. Rows are moved by a known
// amount per frame and read back: the pass is that nothing on screen moves by anything else.
//   node scripts/virtual.mjs                 chrome, 10,000 items, writes evals/results/virtual.json
//   node scripts/virtual.mjs --browser=webkit --n=2000
import { existsSync, mkdtempSync, rmSync, statSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { SWEEP, COVERED } from './virtual-measure.mjs'

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(pkg, 'package.json'))
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d
const N = Number(arg('n', 10000)),
  which = arg('browser', 'chromium'),
  noEngine = process.argv.includes('--no-engine')
const engine = resolve(pkg, '../text/dist/index.js')
if (!existsSync(engine)) throw new Error('build ../text first: npm run build --prefix ../text')

async function build(outDir) {
  const vite = await import('vite')
  const { default: kerf } = await import('@kerf-js/core/vite')
  const slot = {
    name: 'measure-slot',
    enforce: 'pre',
    resolveId: (s) => (s === 'kerf:slot/text.measure' && !noEngine ? '\0measure' : null),
    load: (i) =>
      i === '\0measure'
        ? `export const provider = 'slim'\nexport const load = () => import(${JSON.stringify(engine)}).then(m => m.loadTextEngine())\n`
        : null,
  }
  await vite.build({
    root: join(pkg, 'test/virtual'),
    base: './',
    logLevel: 'silent',
    plugins: [slot, kerf()],
    build: { outDir, emptyOutDir: true },
  })
}

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const serve = (dist) =>
  new Promise((ok) => {
    const s = createServer((q, r) => {
      const path = q.url.split('?')[0]
      let p = join(dist, path)
      if (path === '/') p = join(dist, 'index.html')
      if (!existsSync(p) || statSync(p).isDirectory()) {
        fails.push(`404 ${path}`)
        r.writeHead(404)
        return r.end()
      }
      r.writeHead(200, { 'content-type': types[extname(p)] ?? 'application/octet-stream' })
      r.end(readFileSync(p))
    }).listen(0, () => ok(s))
  })

const launch = () => {
  const pw = require('playwright-core')
  return pw[which].launch()
}

if (process.argv.includes('--build-only')) {
  await build(arg('out'))
  process.exit(0)
}

const fails = []
const out = {}
const dir = mkdtempSync(join(tmpdir(), 'veneer-virtual-'))
await build(dir)
const server = await serve(dir),
  base = `http://127.0.0.1:${server.address().port}/`
const browser = await launch()
const must = (ok, what) => {
  if (!ok) fails.push(what)
}

async function open(view, extra = '') {
  const page = await (
    await browser.newContext({ viewport: { width: 1280, height: 800 } })
  ).newPage()
  page.on('pageerror', (e) => {
    if (!/ResizeObserver loop/.test(String(e))) fails.push(`${view}: ${e}`)
  })
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ResizeObserver loop/.test(m.text()))
      fails.push(`${view}: ${m.text()}`)
  }) // the loop note is the browser saying a correction waits a frame
  const t = Date.now()
  await page.goto(`${base}?view=${view}&n=${N}${extra}`)
  await page.waitForSelector('[data-part="row"]')
  const first = Date.now() - t
  await page.waitForTimeout(1200) // the idle slices finish
  await page.evaluate(() => {
    if (window.drift) window.drift.length = 0
  }) // what rendered before the engine loaded
  return { page, first }
}

async function sweep(name, view, target, opts = {}) {
  const { page, first } = await open(view, opts.extra)
  const r = { firstRowMs: first }
  const nodes0 = await page.evaluate(
    (s) => document.querySelector(s).querySelectorAll('*').length,
    target.scroller,
  )
  r.nodesAtRest = nodes0
  if (opts.from === 'end')
    await page.evaluate((s) => {
      const e = document.querySelector(s)
      e.scrollTop = 0
    }, target.scroller)
  await page.waitForTimeout(300)
  r.down = await page.evaluate(SWEEP, { ...target, step: 120, frames: 300, key: target.key })
  r.fling = await page.evaluate(SWEEP, { ...target, step: 2400, frames: 200, key: target.key })
  r.up = await page.evaluate(SWEEP, { ...target, step: -120, frames: 300, key: target.key })
  r.covered = await page.evaluate(COVERED, target)
  r.drift = await page.evaluate(() => window.drift?.length ?? 0)
  out[name] = r
  for (const k of ['down', 'fling', 'up'])
    must(r[k].worstJump <= 1, `${name} ${k}: a row moved ${r[k].worstJump}px off the scroll`)
  for (const k of ['down', 'up'])
    must(!r[k].blankFrames, `${name} ${k}: ${r[k].blankFrames} blank frames`)
  must(r.covered.overlap <= 1, `${name}: rows overlap by ${r.covered.overlap}px`)
  r.seen = r.down.rowsSeen + r.fling.rowsSeen
  must(
    noEngine || r.drift <= Math.max(0, r.seen * 0.01),
    `${name}: ${r.drift} of ${r.seen} rows rendered more than 1px off their predicted height`,
  )
  must(
    Math.max(r.nodesAtRest, r.down.nodes) < (target.nodes ?? 400),
    `${name}: ${Math.max(r.nodesAtRest, r.down.nodes)} nodes in the window`,
  )
  return page
}

const LIST = {
  scroller: '[data-scope="virtual"]',
  row: '[data-part="row"]:not([data-probe])',
  key: 'aria-posinset',
}
const page = await sweep('list', 'list', LIST)
const narrow = await page.evaluate(async () => {
  const el = document.querySelector('[data-scope="virtual"]')
  el.scrollTop = 200000
  await new Promise((r) => {
    setTimeout(r, 200)
  })
  const rowsTop = () =>
    [...el.querySelectorAll('[data-part="row"]')]
      .map((r) => r.getBoundingClientRect())
      .filter((b) => b.bottom > el.getBoundingClientRect().top)[0]?.top
  const t = performance.now()
  el.style.inlineSize = '700px'
  await new Promise(requestAnimationFrame)
  await new Promise(requestAnimationFrame)
  return {
    resizeMs: +(performance.now() - t).toFixed(1),
    top: rowsTop(),
    height: el.scrollHeight,
    rows: [...el.querySelectorAll('[data-part="row"]')].length,
  }
})
out.list.resize = narrow
await page.waitForTimeout(100)
out.list.resizeWrites = await page.evaluate(async () => {
  const el = document.querySelector('[data-scope="virtual"]')
  await new Promise((r) => {
    setTimeout(r, 150)
  })
  let writes = 0
  const seen = new MutationObserver((l) => {
    writes += l.length
  })
  seen.observe(el, { subtree: true, attributes: true, childList: true, characterData: true })
  const rendered = el.querySelectorAll('[data-part="row"]:not([data-probe])').length
  el.style.inlineSize = '680px'
  await new Promise((r) => {
    setTimeout(r, 150)
  })
  seen.disconnect()
  return { writes, rendered }
})
must(
  out.list.resizeWrites.writes <= out.list.resizeWrites.rendered * 2 + 8,
  `list: a resize wrote ${out.list.resizeWrites.writes} times for ${out.list.resizeWrites.rendered} rows`,
)
out.list.afterResize = await page.evaluate(COVERED, LIST)
must(
  out.list.afterResize.overlap <= 1,
  `list after resize: overlap ${out.list.afterResize.overlap}`,
)
out.list.driftAfterResize = await page.evaluate(() => window.drift.length)
const far = Math.floor(N * 0.7777)
out.list.jump = await page.evaluate(async (to) => {
  window.control.scrollTo(to)
  await new Promise((r) => {
    setTimeout(r, 200)
  })
  const el = document.querySelector('[data-scope="virtual"]')
  const row = el.querySelector(`[aria-posinset="${to + 1}"]`)
  return {
    offBy: row
      ? +(row.getBoundingClientRect().top - el.getBoundingClientRect().top - el.clientTop).toFixed(
          2,
        )
      : null,
  }
}, far)
must(
  out.list.jump.offBy !== null && Math.abs(out.list.jump.offBy) <= 1,
  `list: jump to row landed ${out.list.jump.offBy}px off`,
)

const THREAD = {
  scroller: '[role="log"]',
  row: '[data-part="row"]:not([data-probe])',
  key: 'data-index',
}
const chat = await sweep('chat', 'chat', THREAD, { from: 'end' })
out.chat.live = await chat.evaluate(async () => {
  const el = document.querySelector('[role="log"]')
  const frame = () => new Promise(requestAnimationFrame)
  el.scrollTop = 1e9
  await new Promise((r) => {
    setTimeout(r, 200)
  })
  // append: it stays at the end
  window.say('warming up the row kinds')
  await new Promise((r) => {
    setTimeout(r, 200)
  })
  let writes = 0
  const count = new MutationObserver((l) => {
    for (const r of l) if (!r.target.closest?.('[data-probe]')) writes++
  })
  count.observe(el, { subtree: true, childList: true, attributes: true, characterData: true })
  window.say('hello there')
  await new Promise((r) => {
    setTimeout(r, 120)
  })
  count.disconnect()
  const atEnd = el.scrollHeight - el.clientHeight - el.scrollTop
  // stream 200 tokens: nothing above the tail moves up
  window.stream()
  await new Promise((r) => {
    setTimeout(r, 120)
  })
  let upward = 0,
    last = null
  for (let i = 0; i < 200; i++) {
    window.append('word ')
    await frame()
    const tail =
      [...el.querySelectorAll('[data-part="row"]:not([data-probe])')].at(-1).getBoundingClientRect()
        .top + el.scrollTop
    if (last !== null) upward = Math.max(upward, last - tail)
    last = tail
  }
  const endGap = el.scrollHeight - el.clientHeight - el.scrollTop
  // scrolled away: a prepend doesn't move the page
  el.scrollTop = 40000
  await new Promise((r) => {
    setTimeout(r, 300)
  })
  const row = [...el.querySelectorAll('[data-part="row"]:not([data-probe])')].find(
    (r) => r.getBoundingClientRect().top > el.getBoundingClientRect().top + 40,
  )
  const before = row.getBoundingClientRect().top
  window.older(200)
  await new Promise((r) => {
    setTimeout(r, 300)
  })
  const shift = row.isConnected ? row.getBoundingClientRect().top - before : null
  return {
    appendWrites: writes,
    atEnd,
    streamUpward: +upward.toFixed(2),
    endGap,
    prependShift: shift === null ? null : +shift.toFixed(2),
  }
})
must(out.chat.live.appendWrites <= 6, `chat: an append wrote ${out.chat.live.appendWrites} times`)
must(out.chat.live.atEnd <= 1, `chat: append left ${out.chat.live.atEnd}px from the end`)
must(
  out.chat.live.streamUpward <= 1,
  `chat: the stream moved the tail up ${out.chat.live.streamUpward}px`,
)
must(out.chat.live.endGap <= 48, `chat: the stream lost the end by ${out.chat.live.endGap}px`)
must(
  out.chat.live.prependShift !== null && Math.abs(out.chat.live.prependShift) <= 1,
  `chat: prepend moved a row ${out.chat.live.prependShift}px`,
)

await sweep('feed', 'feed', {
  scroller: '[data-scope="virtual"]',
  row: '[role="article"]:not([data-probe])',
  key: 'aria-posinset',
})
const board = await sweep('kanban', 'kanban', {
  scroller: '[data-part="cards"]',
  row: '[data-part="row"]:not([data-probe])',
  key: 'aria-posinset',
})
out.kanban.move = await board.evaluate(async () => {
  const card = document.querySelector('[data-part="row"]:not([data-probe]) [data-part="card"]')
  const title = card.querySelector('h4').textContent
  card.focus()
  card.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true }),
  )
  await new Promise((r) => {
    setTimeout(r, 300)
  })
  const second = document.querySelectorAll('[data-part="column"]')[1]
  return {
    inColumn:
      !!second.querySelector('h4') &&
      [...second.querySelectorAll('h4')].some((h) => h.textContent === title),
    focusIn: second.contains(document.activeElement),
  }
})
must(out.kanban.move.inColumn, 'kanban: Alt+→ did not move the card')
must(out.kanban.move.focusIn, 'kanban: focus did not follow the card')

const grid = await sweep('grid', 'grid', {
  scroller: '[data-scope="scroll-grid"]',
  row: '[data-part="row"]:not([data-probe])',
  key: 'aria-rowindex',
  nodes: 800,
})
out.grid.keys = await grid.evaluate(async () => {
  const el = document.querySelector('[data-scope="scroll-grid"]')
  el.scrollTop = 0
  el.focus()
  await new Promise((r) => {
    setTimeout(r, 100)
  })
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', ctrlKey: true, bubbles: true }))
  await new Promise((r) => {
    setTimeout(r, 200)
  })
  const id = el.getAttribute('aria-activedescendant')
  const cell = document.getElementById(id)
  return { id, exists: !!cell, cellsAtEnd: el.querySelectorAll('[role="gridcell"]').length }
})
must(out.grid.keys.exists, `grid: aria-activedescendant ${out.grid.keys.id} names no node`)
await sweep(
  'gridWrapped',
  'grid',
  {
    scroller: '[data-scope="scroll-grid"]',
    row: '[data-part="row"]:not([data-probe])',
    key: 'aria-rowindex',
    nodes: 800,
  },
  { extra: '&wrap=1' },
)

await browser.close()
server.close()
rmSync(dir, { recursive: true, force: true })
console.log(JSON.stringify(out, null, 1))
if (!process.argv.includes('--no-write') && !noEngine && which === 'chromium')
  writeFileSync(
    join(pkg, '../../evals/results/virtual.json'),
    JSON.stringify({ n: N, browser: which, at: new Date().toISOString(), ...out }, null, 1) + '\n',
  )
if (fails.length) {
  console.error(`\nFAILED\n${fails.join('\n')}`)
  process.exit(1)
}
console.log('[virtual] all pass')
