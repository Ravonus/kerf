// The style study: tier by form for 24 icons, at 16, 20, 24 and 32, for review before any of it reaches the set.
//   node scripts/style-sheet.mjs [out.html]
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { CSS, PROCEDURAL, STUDY, forms } from './study.mjs'

const SIZES = [16, 20, 24, 32]
const CELLS = [['quiet', 'hollow'], ['quiet', 'solid'], ['balanced', 'hollow'], ['balanced', 'solid'], ['vivid', 'hollow'], ['vivid', 'solid']]
const svg = (html, size) => `<svg viewBox="0 0 24 24" data-icon style="width:${size}px;height:${size}px" aria-hidden="true">${html}</svg>`
const row = (name, label) => { const f = forms(name); return `<tr>${label ? `<th>${name}</th>` : ''}${CELLS.map(([t, v]) => `<td>${SIZES.map(s => svg(f[t][v], s)).join('')}</td>`).join('')}</tr>` }
const head = `<tr><th></th>${CELLS.map(([t, v]) => `<th>${t} ${v}</th>`).join('')}</tr>`
const shot = (d, zoom) => { const f = new URL(`../art/style/shot-${d}.png`, import.meta.url); if (!existsSync(f)) return ''; const b = readFileSync(f); return `<p>${d} screen, magnified without smoothing</p><img alt="The grid on a ${d} screen" width="${b.readUInt32BE(16) * zoom}" src="data:image/png;base64,${b.toString('base64')}">` }

const out = process.argv[2] ?? new URL('../style-sheet.html', import.meta.url).pathname
writeFileSync(out, `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Icon style study</title>
<style>
${CSS}
:root { --bg: #f6f5f1; --fg: #1c1c1a; --mute: #6b6a64; --line: #dddbd3; --accent: #c2410c; --knock: var(--bg); color-scheme: light; }
:root[data-theme="dark"] { --bg: #111311; --fg: #e8e7e1; --mute: #9b9a92; --line: #2a2c29; --accent: #fb923c; color-scheme: dark; }
@media (forced-colors: active) { :root { --bg: Canvas; --fg: CanvasText; --accent: CanvasText; --knock: Canvas; } }
body { margin: 0; background: var(--bg); color: var(--fg); font: 13px/1.4 ui-sans-serif, system-ui, sans-serif; }
header { position: sticky; top: 0; left: 0; z-index: 1; display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; padding: 12px 16px; background: var(--bg); border-block-end: 1px solid var(--line); }
h1 { font-size: 15px; margin: 0; } h2 { font-size: 13px; font-weight: 500; margin: 24px 0 8px; } p { margin: 0 0 6px; color: var(--mute); }
main { padding: 0 16px 32px; overflow-x: auto; }
table { border-collapse: collapse; background: var(--bg); }
th { font-weight: 500; text-align: start; font-size: 11px; color: var(--mute); padding: 4px 8px; white-space: nowrap; } tbody th { font-family: ui-monospace, monospace; }
td { padding: 6px 8px; border-block-start: 1px solid var(--line); white-space: nowrap; }
svg[data-icon] { margin-inline-end: 6px; vertical-align: middle; }
.accent { --weft: var(--accent); }
#shots img { display: block; image-rendering: pixelated; margin-block-end: 16px; }
</style></head><body>
<header>
  <h1>Icon style study</h1>
  <label><input type="checkbox" id="dark"> Dark</label>
  <label><input type="checkbox" id="accent"> Accent weft</label>
  <p>Two forms, hollow and solid, in three tiers. Each cell is 16, 20, 24, 32 px.</p>
</header>
<main>
<h2>Tier by form</h2>
<table><thead>${head}</thead><tbody>${STUDY.map(n => row(n, true)).join('')}</tbody></table>
<h2>Procedural pass, no hand drawing: what the rest of the set would get</h2>
<table><thead>${head}</thead><tbody>${PROCEDURAL.map(n => row(n, true)).join('')}</tbody></table>
<h2>Real pixels, whichever screen reads this page</h2>
<div id="shots">${shot('1x', 2)}${shot('2x', 1)}</div>
<table id="capture" hidden>${STUDY.map(n => row(n, false)).join('')}</table>
</main>
<script>
const on = (id, f) => document.getElementById(id).addEventListener('change', e => f(e.target.checked))
on('dark', v => { document.documentElement.dataset.theme = v ? 'dark' : 'light' })
on('accent', v => document.body.classList.toggle('accent', v))
</script>
</body></html>
`)
console.log(out)
