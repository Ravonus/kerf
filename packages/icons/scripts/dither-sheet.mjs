// The dithering comparison: twelve icons in each treatment, at the sizes that matter, light, dark and forced colours.
//   node scripts/dither-sheet.mjs [out.html]
import { writeFileSync } from 'node:fs'
import { gridOf, load } from './build.mjs'
import { cells } from './draw.mjs'
import { PATTERNS, dither } from './raster.mjs'

const SAMPLE = ['folder', 'bell', 'heart', 'file', 'shield', 'cloud', 'calendar', 'home', 'mail', 'star', 'image', 'database']
const icons = await load()
const treatments = [['plain', null], ...Object.keys(PATTERNS).map(k => [k, k])]
const svg = (d, size) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="${d}"/></svg>`
const row = (label, pattern) => `<tr><th>${label}</th>${[16, 24, 48].map(size => `<td>${SAMPLE.map(n => {
  const g = gridOf(n, icons[n]), c = cells(pattern ? dither(g, pattern) : g)
  return svg(c.both, size)
}).join('')}</td>`).join('')}</tr>`
const table = `<table><thead><tr><th></th><th>16 px</th><th>24 px</th><th>48 px</th></tr></thead><tbody>${treatments.map(([l, p]) => row(l, p)).join('')}</tbody></table>`
const out = process.argv[2] ?? new URL('../dither-sheet.html', import.meta.url).pathname

writeFileSync(out, `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Icon dithering</title>
<style>
main { padding: 16px; background: #f6f5f1; color: #1c1c1a; font: 13px/1.4 ui-sans-serif, system-ui, sans-serif; }
main.dark { background: #111311; color: #e8e7e1; }
h1 { font-size: 15px; margin: 0 0 8px; }
table { border-collapse: collapse; } th { text-align: start; padding: 6px 12px 6px 0; font-weight: 500; }
td { padding: 6px 16px 6px 0; white-space: nowrap; }
svg { fill: currentColor; margin-inline-end: 6px; vertical-align: middle; }
path { transform: scale(1.5); shape-rendering: crispEdges; }
</style></head><body>
<main><h1>Dithering, light</h1>${table}</main>
<main class="dark"><h1>Dithering, dark</h1>${table}</main>
</body></html>
`)
console.log(out)
