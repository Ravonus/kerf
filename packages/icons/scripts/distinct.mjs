// Do the forms and tiers look different? Renders each icon in Chromium at 16 and 24 px and compares what actually paints.
// The score is the share of inked pixels whose brightness moves by more than a quarter of the range. Markup can differ and
// still look the same, so nothing but the rendered pixels counts.
//   node scripts/distinct.mjs study    the 24 of the style study, in the new forms
//   node scripts/distinct.mjs current  all 651, as they ship today
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const THRESHOLD = { form: .3, tier: .15 }
const SIZES = [16, 24]
const PAIRS = [
  ['form', 'quiet hollow', 'quiet solid'], ['form', 'balanced hollow', 'balanced solid'], ['form', 'vivid hollow', 'vivid solid'],
  ['tier', 'quiet hollow', 'balanced hollow'], ['tier', 'quiet hollow', 'vivid hollow'], ['tier', 'balanced hollow', 'vivid hollow'],
  ['tier', 'quiet solid', 'balanced solid'], ['tier', 'quiet solid', 'vivid solid'], ['tier', 'balanced solid', 'vivid solid'],
]

/** Each item: { name, cells: { 'quiet hollow': html, ... } }. Paints all of them, one canvas per size, and scores every pair. */
export async function measure(items, css) {
  const require = createRequire(new URL('../../warp/package.json', import.meta.url))
  const { chromium } = require('playwright-core')
  const browser = await chromium.launch()
  const page = await (await browser.newContext({ deviceScaleFactor: 1 })).newPage()
  const keys = Object.keys(items[0].cells), out = []
  for (let at = 0; at < items.length; at += 40) {
    const batch = items.slice(at, at + 40), res = {}
    for (const size of SIZES) {
      const gap = size + 4
      await page.setViewportSize({ width: gap * keys.length, height: gap * batch.length })
      await page.setContent(`<!doctype html><style>:root{--knock:#fff}body{margin:0;background:#fff;color:#000}${css}svg{position:absolute;width:${size}px;height:${size}px}</style>` + batch.map((b, y) => keys.map((k, x) => `<svg data-icon viewBox="0 0 24 24" style="left:${x * gap}px;top:${y * gap}px">${b.cells[k]}</svg>`).join('')).join(''))
      const png = await page.screenshot()
      res[size] = await page.evaluate(async ({ b64, n, cols, size, gap }) => {
        const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode()
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
        const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0)
        const all = []
        for (let y = 0; y < n; y++) { const row = []; for (let k = 0; k < cols; k++) { const d = x.getImageData(k * gap, y * gap, size, size).data, v = []; for (let i = 0; i < d.length; i += 4) v.push(255 - (d[i] + d[i + 1] + d[i + 2]) / 3); row.push(v) } all.push(row) }
        return all
      }, { b64: png.toString('base64'), n: batch.length, cols: keys.length, size, gap })
    }
    batch.forEach((b, y) => {
      const pairs = PAIRS.map(([kind, A, B]) => {
        const scores = SIZES.map(size => {
          const a = res[size][y][keys.indexOf(A)], c = res[size][y][keys.indexOf(B)]
          let ink = 0, moved = 0
          for (let i = 0; i < a.length; i++) { if (a[i] > 40 || c[i] > 40) ink++; if (Math.abs(a[i] - c[i]) > 64) moved++ }
          return ink ? moved / ink : 0
        })
        const score = Math.min(...scores)
        return { kind, A, B, score, ok: score >= THRESHOLD[kind] }
      })
      out.push({ name: b.name, pairs, ok: pairs.every(p => p.ok) })
    })
  }
  await browser.close()
  return out
}

export function summary(results) {
  const lines = [`${results.filter(r => r.ok).length}/${results.length} icons pass`]
  for (const [kind, A, B] of PAIRS) {
    const scores = results.map(r => r.pairs.find(p => p.A === A && p.B === B))
    lines.push(`${(kind + ' ' + A + ' / ' + B).padEnd(42)} pass ${scores.filter(s => s.ok).length}, worst ${Math.min(...scores.map(s => s.score)).toFixed(2)}, median ${scores.map(s => s.score).sort((a, b) => a - b)[scores.length >> 1].toFixed(2)}`)
  }
  return lines.join('\n')
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const which = process.argv[2] ?? 'study'
  let items, css
  if (which === 'current') {
    const { fragments, load } = await import('./build.mjs')
    const { readFileSync } = await import('node:fs')
    const icons = await load()
    css = readFileSync(new URL('../src/icons.css', import.meta.url), 'utf8').replace(/@layer[^{]*\{/, '').replace(/\}\s*$/, '')
    const tier = (html, keep) => html.replace(/<path data-t="([oqbv])"[^>]*\/>/g, (m, t) => (keep.includes(t) ? m : ''))
    items = Object.entries(icons).map(([name, e]) => {
      const f = fragments(name, e), H = f.line + f.hollow, S = f.solid
      return { name, cells: { 'quiet hollow': tier(H, 'oq'), 'quiet solid': tier(S, 'oq'), 'balanced hollow': tier(H, 'ob'), 'balanced solid': tier(S, 'ob'), 'vivid hollow': tier(H, 'v'), 'vivid solid': tier(S, 'v') } }
    })
  } else {
    const { CSS, STUDY, forms } = await import('./study.mjs')
    css = CSS
    items = STUDY.map(name => { const f = forms(name); return { name, cells: Object.fromEntries(['quiet', 'balanced', 'vivid'].flatMap(t => ['hollow', 'solid'].map(v => [`${t} ${v}`, f[t][v]]))) } })
  }
  const results = await measure(items, css)
  console.log(summary(results))
  const bad = results.filter(r => !r.ok).slice(0, 24)
  for (const r of bad) console.log(r.name.padEnd(16), r.pairs.filter(p => !p.ok).map(p => `${p.A}/${p.B} ${p.score.toFixed(2)}`).join('; ').slice(0, 150))
  if (which === 'study' && bad.length) process.exitCode = 1
}
