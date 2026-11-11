// lab.json as one page with no dependencies: before and after against Solid, then what each speed path costs and buys.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
const NOISE = 3 // percent: closer than this is not called a difference (quick rounds)
const BUNDLES = ['hello', 'counter', 'shop', 'benchmark app']
const num = (v) =>
  v == null
    ? '–'
    : v >= 100
      ? v.toFixed(0)
      : v >= 10
        ? v.toFixed(1)
        : v >= 1
          ? v.toFixed(2)
          : v.toPrecision(2)

/** Every timed number as `group / name`, so a variant's and the baseline's line up; lower is better for all. */
function metrics(stack, reactive) {
  const out = {}
  for (const [g, names] of Object.entries(stack ?? {})) {
    if (g === 'rows total') continue
    for (const [k, v] of Object.entries(names))
      out[g === 'rows script' ? `rows: ${k}` : `${g}: ${k.replace(', ms per tick', '')}`] = v
  }
  for (const [k, v] of Object.entries(reactive?.ms ?? {})) out[`core: ${k}`] = v
  for (const [k, v] of Object.entries(reactive?.creation ?? {}))
    out[`core: ${k}, ns each`] = v.nsEach
  return out
}

const cell = (v, ref) => {
  if (v == null || ref == null) return `<td class=n>${num(v)}</td>`
  const pct = ((v - ref) / ref) * 100
  const c = pct <= -NOISE ? 'win' : pct >= NOISE ? 'loss' : 'tie'
  return `<td class="n ${c}" title="${pct.toFixed(1)}%">${num(v)}</td>`
}

/** A metric's name in the table, back to its place in measure.mjs's comparison. */
const held_ = (compared, key) => {
  if (key.startsWith('rows: ')) return compared['rows script']?.[key.slice(6)]
  const [g, k] = key.split(': ')
  const names = compared[g] ?? {}
  return names[k] ?? names[`${k}, ms per tick`]
}

function compare(lab) {
  const g = lab.timed.grid,
    r = lab.timed.reactive ?? {}
  const m = Object.fromEntries(
    Object.keys(g).map((s) => [s, metrics(g[s], r[s.replace('-batch', '')])]),
  )
  const on = m.kerf,
    solid = m['solid-batch'],
    base = m['kerf-base'],
    off = m['off-all']
  const keys = Object.keys(on).filter((k) => !k.startsWith('core:') || solid?.[k] != null)
  return `<table><thead><tr><th>Lower is better</th>${base ? '<th>before (original)</th>' : ''}${off ? '<th>every path off</th>' : ''}<th>kerf now</th><th>Solid 1.9</th><th>kerf vs Solid</th></tr></thead><tbody>${keys
    .map((k) => {
      const pct = solid?.[k] ? ((on[k] - solid[k]) / solid[k]) * 100 : null
      const held = lab.timed.compared?.kerf && held_(lab.timed.compared.kerf, k)
      // With an interval, a win or a loss is one that held across runs; without one, the noise line decides.
      const verdict = held
        ? held.hi < 1
          ? 'win'
          : held.lo > 1
            ? 'loss'
            : 'tie'
        : pct == null
          ? ''
          : pct <= -NOISE
            ? 'win'
            : pct >= NOISE
              ? 'loss'
              : 'tie'
      const text = held
        ? `${((held.ratio - 1) * 100).toFixed(1)}% <small>${((held.lo - 1) * 100).toFixed(1)} to ${((held.hi - 1) * 100).toFixed(1)}</small>`
        : pct == null
          ? '–'
          : `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%`
      return `<tr><th>${esc(k)}</th>${base ? `<td class=n>${num(base[k])}</td>` : ''}${off ? `<td class=n>${num(off[k])}</td>` : ''}${cell(on[k], solid?.[k])}<td class=n>${num(solid?.[k])}</td><td class="n ${verdict}">${text}</td></tr>`
    })
    .join('')}</tbody></table>`
}

function ablation(lab) {
  const sizes = lab.sizes,
    on = sizes.on
  const list = lab.variants.filter((v) => v.id !== 'on')
  const g = lab.timed?.grid,
    r = lab.timed?.reactive ?? {}
  const m = g && Object.fromEntries(Object.keys(g).map((s) => [s, metrics(g[s], r[s])]))
  const row = (v) => {
    const cost = BUNDLES.map((b) => on[b] - (sizes[v.id]?.[b] ?? on[b]))
    const gains = m?.[v.id]
      ? Object.entries(m[v.id])
          .map(([k, off]) => [k, ((off - m.kerf[k]) / m.kerf[k]) * 100])
          .filter(([k, p]) => isFinite(p) && Math.abs(p) >= NOISE)
          .sort((a, b) => b[1] - a[1])
      : []
    const show = (list) =>
      list
        .map(
          ([k, p]) =>
            `<span class="${p > 0 ? 'win' : 'loss'}">${esc(k)} ${p > 0 ? '+' : ''}${p.toFixed(0)}%</span>`,
        )
        .join(' ')
    return `<tr><th>${esc(v.off.join(', '))}<small>${esc(v.says ?? '')}</small></th>${cost.map((c) => `<td class=n>${c > 0 ? '+' : ''}${c}</td>`).join('')}<td>${gains.length ? show(gains) : m ? '<span class=tie>nothing past the noise</span>' : '–'}</td></tr>`
  }
  return `<table class=flags><thead><tr><th>Path</th>${BUNDLES.map((b) => `<th>${b}<small>bytes br</small></th>`).join('')}<th>What it buys: how much slower with it off (benchmark +%). Red: faster off.</th></tr></thead><tbody>${list.map(row).join('')}</tbody></table>`
}

export function render(lab) {
  const t = lab.timed
  return `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Kerf speed lab</title>
<style>
:root{color-scheme:light dark;--bg:#fff;--fg:#1c1c1e;--dim:#6b6b70;--line:#e3e3e6;--win:#0a7a3b;--loss:#b3261e;--tie:#6b6b70}
@media (prefers-color-scheme:dark){:root{--bg:#161618;--fg:#ececee;--dim:#9a9aa0;--line:#303034;--win:#58c98a;--loss:#ff8a80;--tie:#9a9aa0}}
body{background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif;margin:0 auto;max-width:1040px;padding:24px 16px}
h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:32px 0 8px}p{color:var(--dim);margin:4px 0 12px}
.wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}
th,td{border-bottom:1px solid var(--line);padding:5px 10px 5px 0;text-align:left;vertical-align:top;font-weight:400}
thead th{color:var(--dim);font-size:13px}tbody th{white-space:nowrap}.n{text-align:right;white-space:nowrap}small{display:block;color:var(--dim);font-size:12px;white-space:normal;max-width:30ch}
.win{color:var(--win)}.loss{color:var(--loss)}.tie{color:var(--tie)}.flags span{display:inline-block;margin-right:10px;font-size:13px}code{font:13px ui-monospace,monospace}
</style>
<h1>Kerf speed lab</h1>
<p>${esc(lab.when.slice(0, 16).replace('T', ' '))} UTC${t ? ` · ${esc(t.machine)} · load ${t.loads ? Math.min(...t.loads) : ''} to ${t.maxLoad} ${t.valid ? '' : '(<b>too high to count</b>)'}` : ' · sizes only'}. ${t?.compared ? 'The last column is the median gap with its 95% interval across runs: coloured only when the whole interval is on one side.' : `Differences under ${NOISE}% are noise here and are not coloured.`} Run it again with <code>node benchmarks/speed/lab.mjs</code>.</p>
${t ? `<h2>Before and after, against Solid</h2><p>Milliseconds unless the row says otherwise. Green beats Solid, red loses to it.</p><div class=wrap>${compare(lab)}</div>` : ''}
<h2>Each speed path</h2><p>Bundle columns are what the path adds, in brotli bytes. Each row is everything on except that path.</p><div class=wrap>${ablation(lab)}</div>`
}
