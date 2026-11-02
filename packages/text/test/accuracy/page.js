// Runs inside the page. Two kinds of library:
//   window.UPSTREAM: unmodified @chenglou/pretext (prepare/layout/clearCache), the reference
//   a fork engine module loaded from dist/ (await import(url)).engine
import { makeCorpus } from './corpus.js'
const med = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)] }
const now = () => performance.now()

window.domHeights = function ({ corpus, n, family, size, lh, widths }) {
  const texts = makeCorpus(corpus, n)
  const host = document.getElementById('host')
  const style = `font:${size}px ${family};line-height:${lh}px;overflow-wrap:break-word;`
  host.innerHTML = ''
  const frag = document.createDocumentFragment()
  const els = texts.map(t => { const d = document.createElement('div'); d.style.cssText = style; d.textContent = t; frag.appendChild(d); return d })
  host.appendChild(frag)
  const out = {}
  for (const w of widths) { host.style.width = w + 'px'; out[w] = els.map(e => e.getBoundingClientRect().height) }
  host.innerHTML = ''
  return out
}

async function libFor(spec) {
  if (spec === 'upstream') {
    const P = window.UPSTREAM
    return { prepare: (t, f) => P.prepare(t, f), layout: (p, w, lh) => P.layout(p, w, lh).height, clear: () => P.clearCache(), settle: async () => {}, stats: () => ({}) }
  }
  const E = (await import(spec)).engine
  window.__engine = E
  return {
    prepare: (t, f) => E.prepare(t, f),
    layout: (h, w, lh) => E.layout(h, w, lh).height,
    clear: () => E.clear(),
    settle: async hs => { await Promise.all(hs.map(h => h.ready)) },
    preload: async (texts, font) => { const s = new Set(); for (const t of texts) for (const p of E.needs(t, font)) s.add(p); await E.load([...s]) },
    stats: hs => ({ inexactBeforeSettle: hs.filter(h => !h.exact).length, loaded: E.loaded().join(',') }),
    E,
  }
}

window.libHeights = async function ({ lib, corpus, n, family, size, lh, widths, reps = 1, preload = true }) {
  const L = await libFor(lib)
  const texts = makeCorpus(corpus, n)
  const font = `${size}px ${family}`
  // Which packs would this corpus pull, paragraph by paragraph, before any is loaded?
  let pulls = null
  if (L.E) {
    pulls = {}
    for (const t of texts) { const k = L.E.needs(t, font).join('+') || 'base'; pulls[k] = (pulls[k] ?? 0) + 1 }
  }
  if (preload && L.preload) await L.preload(texts, font)
  let hs = texts.map(t => L.prepare(t, font))
  const stats = L.stats(hs)
  await L.settle(hs)
  const tc = [], tw = [], tl = []
  for (let r = 0; r < reps; r++) {
    L.clear()
    let t0 = now(); texts.map(t => L.prepare(t, font)); tc.push(now() - t0)
    t0 = now(); hs = texts.map(t => L.prepare(t, font)); tw.push(now() - t0)
    await L.settle(hs)
    t0 = now(); for (const h of hs) L.layout(h, widths[0], lh); tl.push(now() - t0)
  }
  // A lite handle laid out narrower than its widest word escalates to the exact tier inside layout() and
  // answers with an estimate meanwhile: count those, settle, and lay out again.
  let out = {}, estimates = 0
  for (const w of widths) out[w] = hs.map(h => L.layout(h, w, lh))
  if (L.E) {
    const counted = {}
    for (const w of widths) counted[w] = hs.map(h => L.E.layout(h, w, lh))
    estimates = Object.values(counted).flat().filter(r => r.exact === false).length
    await L.settle(hs.filter(h => h.ready))
    out = {}
    for (const w of widths) out[w] = hs.map(h => L.layout(h, w, lh))
  }
  const tiers = L.E ? { lite: hs.filter(h => h.lite && !h.x).length, escalated: hs.filter(h => h.lite && h.x).length, exact: hs.filter(h => !h.lite).length } : null
  const complexAfter = L.E ? hs.filter(h => h.x && !h.x.p?.simpleLineWalkFastPath).length : 0
  const tierOf = L.E ? hs.map(h => h.lite ? (h.x ? 'e' : 'l') : 'x').join('') : null
  return { tierOf, heights: out, prepareCold: med(tc), prepareWarm: med(tw), layout: med(tl), pulls, stats, tiers, estimates, complexHandles: complexAfter }
}

// lines() of the fork's lite handles against upstream walkLineRanges(): count, each line's width and its
// start and end cursors, at every width the lite tier answers itself (no narrower than the widest word).
window.linesCheck = async function ({ lib, corpus, n, family, size, widths }) {
  const E = (await import(lib)).engine, P = window.UPSTREAM
  const texts = makeCorpus(corpus, n), font = `${size}px ${family}`
  let checked = 0, mismatched = 0, example = null
  for (const t of texts) {
    const h = E.prepare(t, font)
    if (!h.lite) continue
    const p = P.prepareWithSegments(t, font)
    for (const w of widths) {
      if (h.lite.maxText > w) continue
      const ours = E.lines(h, w), theirs = []
      P.walkLineRanges(p, w, l => theirs.push({ width: l.width, start: { ...l.start }, end: { ...l.end } }))
      checked++
      const same = ours.length === theirs.length && ours.every((l, i) => l.width === theirs[i].width && l.start.segmentIndex === theirs[i].start.segmentIndex && l.start.graphemeIndex === theirs[i].start.graphemeIndex && l.end.segmentIndex === theirs[i].end.segmentIndex && l.end.graphemeIndex === theirs[i].end.graphemeIndex)
      if (!same) { mismatched++; example ??= { t, w, ours, theirs } }
    }
  }
  return { checked, mismatched, example }
}
