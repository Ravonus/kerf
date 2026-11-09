// The contact sheet: every icon, with controls for tier, form, size, theme and accent, and a search. One static HTML file
// built from the art, so it needs no build and no server.
//   node scripts/sheet.mjs [out.html]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import ACTIONS from '../art/actions/index.mjs'
import { load } from './build.mjs'
import { acting, forms } from './forms.mjs'

const dir = new URL('../art/', import.meta.url)
const icons = await load()
const groups = {}
for (const f of readdirSync(dir)
  .filter((n) => n.endsWith('.mjs'))
  .sort())
  groups[f.slice(2, -4)] = Object.keys((await import(new URL(f, dir))).default).sort()
const data = Object.fromEntries(
  Object.entries(icons).map(([n, e]) => {
    const f = forms(n, e),
      a = ACTIONS[n] && acting(n, e, ACTIONS[n])
    return [
      n,
      {
        hollow: f.hollow.line + f.hollow.pixels,
        solid: f.solid.line + f.solid.pixels,
        ...(a && { action: a.line + a.pixels }),
      },
    ]
  }),
)
const css =
  ['icons.css', 'tiers.css']
    .map((f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8'))
    .join('\n') +
  Object.keys(ACTIONS)
    .map((n) => readFileSync(new URL(`../src/gen/actions/${n}.css`, import.meta.url), 'utf8'))
    .join('\n')
const out = process.argv[2] ?? new URL('../contact-sheet.html', import.meta.url).pathname
const pick = (name, label, values, on) =>
  `<fieldset><legend>${label}</legend>${values.map((v) => `<label><input type="radio" name="${name}" value="${v}"${v === on ? ' checked' : ''}>${v}</label>`).join('')}</fieldset>`

writeFileSync(
  out,
  `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>weft icons</title>
<style>
${css}
[data-accent="accent"] { --warp-icon-weft-color: #d9480f; }
:root { --bg: #f6f5f1; --fg: #1c1c1a; --mute: #6b6a64; --line: #dddbd3; color-scheme: light; --warp-icon-knock: var(--bg); }
:root[data-theme="dark"] { --bg: #111311; --fg: #e8e7e1; --mute: #9b9a92; --line: #2a2c29; color-scheme: dark; }
[data-tier="quiet"] { --warp-icon-o: inline; --warp-icon-q: inline; --warp-icon-b: none; --warp-icon-v: none; }
[data-tier="balanced"] { --warp-icon-o: inline; --warp-icon-q: none; --warp-icon-b: inline; --warp-icon-v: none; }
[data-tier="vivid"] { --warp-icon-o: none; --warp-icon-q: none; --warp-icon-b: none; --warp-icon-v: inline; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 13px/1.4 ui-sans-serif, system-ui, sans-serif; }
header { position: sticky; top: 0; z-index: 1; display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; padding: 12px 16px; background: var(--bg); border-block-end: 1px solid var(--line); }
h1 { font-size: 15px; margin: 0; } h2 { font-size: 12px; margin: 20px 0 6px; color: var(--mute); font-weight: 500; text-transform: capitalize; }
fieldset { display: flex; gap: 8px; border: 0; margin: 0; padding: 0; } legend { float: inline-start; color: var(--mute); margin-inline-end: 4px; }
label { display: inline-flex; gap: 3px; align-items: center; }
input[type="search"] { font: inherit; color: inherit; background: transparent; border: 1px solid var(--line); border-radius: 4px; padding: 4px 8px; inline-size: min(220px, 100%); }
main { padding: 0 16px 32px; }
section { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); border-block-start: 1px solid var(--line); border-inline-start: 1px solid var(--line); }
figure { margin: 0; padding: 10px 8px 6px; min-inline-size: 0; border-block-end: 1px solid var(--line); border-inline-end: 1px solid var(--line); display: grid; gap: 6px; justify-items: center; }
figure span { display: flex; align-items: center; gap: 10px; min-block-size: 48px; }
figcaption { font: 10px/1.2 ui-monospace, monospace; color: var(--mute); max-inline-size: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tiny { inline-size: 16px; block-size: 16px; }
</style></head><body data-tier="balanced">
<header>
  <h1>weft icons</h1><span id="count"></span>
  <input type="search" id="q" placeholder="Search" aria-label="Search icons">
  ${pick('tier', 'Tier', ['quiet', 'balanced', 'vivid'], 'balanced')}
  ${pick('variant', 'Form', ['hollow', 'solid', 'action'], 'hollow')}
  ${pick('size', 'Size', ['16', '20', '24', '32', '48'], '32')}
  ${pick('theme', 'Theme', ['light', 'dark'], 'light')}
  ${pick('accent', 'Weft', ['ink', 'accent'], 'ink')}
</header>
<main id="main"></main>
<script type="application/json" id="data">${JSON.stringify({ groups, data })}</script>
<script>
const { groups, data } = JSON.parse(document.getElementById('data').textContent)
const main = document.getElementById('main'), value = n => document.querySelector('input[name="' + n + '"]:checked').value
const svg = (html, size, cls) => '<svg data-icon' + (/ data-d=/.test(html) ? ' data-dither' : '') + ' viewBox="0 0 24 24" aria-hidden="true"' + (cls ? ' class="' + cls + '"' : ' style="width:' + size + 'px;height:' + size + 'px"') + ' data-act="hover focus press">' + html + '</svg>'
function draw() {
  const q = document.getElementById('q').value.trim().toLowerCase(), v = value('variant'), size = value('size')
  document.body.dataset.tier = value('tier')
  document.documentElement.dataset.theme = value('theme')
  document.documentElement.dataset.accent = value('accent')
  let html = '', shown = 0
  for (const [group, names] of Object.entries(groups)) {
    const hit = names.filter(n => n.includes(q) && data[n][v])
    if (!hit.length) continue
    shown += hit.length
    html += '<h2>' + group.replaceAll('-', ', ') + '</h2><section>' + hit.map(n => '<figure tabindex="0"><span>' + svg(data[n][v], size) + (size === '16' ? '' : svg(data[n][v], 16, 'tiny')) + '</span><figcaption>' + n + '</figcaption></figure>').join('') + '</section>'
  }
  main.innerHTML = html || '<p>No icon matches.</p>'
  document.getElementById('count').textContent = shown + ' icons'
}
document.querySelector('header').addEventListener('input', draw)
draw()
</script>
</body></html>
`,
)
console.log(out)
