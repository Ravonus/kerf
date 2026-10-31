// The contact sheet: every icon in all three tiers at 16, 24 and 48, light and dark, plus a 20/32 row and forced colours
// in the check script. Static HTML from the generated art, so it needs no build.
//   node scripts/sheet.mjs [out.html]
import { writeFileSync } from 'node:fs'
import { load, draw } from './build.mjs'

const icons = await load()
const svg = (name, art, tier, size) => `<svg data-icon viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${draw(name, art, tier).replaceAll(' />', '></path>').replaceAll('data-w=""', 'data-w').replace(/transform="scale\(1\.5\)"/g, 'transform="scale(1.5)"')}</svg>`
const cell = (name, art) => `<figure><div>${['quiet', 'balanced', 'vivid'].map(t => `<span class="${t}">${[16, 24, 48].map(s => svg(name, art, t, s)).join('')}</span>`).join('')}</div><figcaption>${name}</figcaption></figure>`
const body = Object.entries(icons).map(([n, a]) => cell(n, a)).join('\n')
const out = process.argv[2] ?? new URL('../contact-sheet.html', import.meta.url).pathname

writeFileSync(out, `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>weft icons</title>
<style>
:root { --bg: #f6f5f1; --fg: #1c1c1a; --mute: #6b6a64; --line: #dddbd3; color-scheme: light dark; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 13px/1.4 ui-sans-serif, system-ui, sans-serif; }
main[data-theme="dark"] { --bg: #111311; --fg: #e8e7e1; --mute: #9b9a92; --line: #2a2c29; background: var(--bg); color: var(--fg); }
main { padding: 16px; background: var(--bg); }
h1 { font-size: 16px; margin: 0 0 4px; } p { margin: 0 0 12px; color: var(--mute); }
section { display: grid; grid-template-columns: repeat(auto-fill, minmax(232px, 1fr)); gap: 0; border-block-start: 1px solid var(--line); border-inline-start: 1px solid var(--line); }
figure { margin: 0; padding: 8px; border-block-end: 1px solid var(--line); border-inline-end: 1px solid var(--line); }
figure div { display: grid; gap: 6px; }
figure span { display: flex; align-items: center; gap: 12px; block-size: 48px; }
figcaption { font: 11px/1.2 ui-monospace, monospace; color: var(--mute); margin-block-start: 6px; }
svg[data-icon] { flex: none; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.balanced [data-w] { stroke-width: 2; }
</style></head><body>
<main data-theme="light"><h1>weft icons · light</h1><p>${Object.keys(icons).length} icons. Rows: quiet, balanced, vivid. Columns: 16, 24, 48 px.</p><section>
${body}
</section></main>
<main data-theme="dark"><h1>weft icons · dark</h1><p>Same set on dark.</p><section>
${body}
</section></main>
</body></html>
`)
console.log(out)
