// Re-encode Pretext's generated engine data for one engine, optionally restricted to an alphabet.
// Restriction is exact for any text whose code points are all in the alphabet: class maps keep those
// code points' classes, and each ICU state table keeps only the states reachable from START over the
// categories those code points (plus EOF and Apple's quote overrides) have, with categories renumbered.
// usage (as module): genEngineData({ upstreamDir, engine, alphabet: [[lo,hi],...] | null }) -> TS source
import * as esbuild from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { pathToFileURL } from 'node:url'

const MAPS = {
  blink: ['chromium/line_normal', 'chromium/line_normal_cj', 'chromium/char', 'chromium/script'],
  webkit: ['apple/line_normal', 'apple/line', 'apple/line_cj', 'apple/char', 'chromium/script'],
  gecko: ['chromium/char', 'gecko/line', 'gecko/east_asian_width', 'chromium/script'],
}
const RULES = {
  blink: ['chromium/line_normal', 'chromium/line_normal_cj', 'chromium/char'],
  webkit: ['apple/line_normal', 'apple/line', 'apple/line_cj', 'apple/char'],
  gecko: ['chromium/char'],
}

async function loadUpstream(dir) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gd-'))
  const out = path.join(tmp, 'u.mjs')
  await esbuild.build({
    stdin: { contents: `export * as D from './generated/engine-break-data.ts'; export { unpackVarints, unpackTable, unpackClassRuns, unpackStateRows } from './line-breaks.ts'`, resolveDir: path.resolve(dir), loader: 'ts' },
    bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error',
  })
  const m = await import(pathToFileURL(out).href)
  fs.rmSync(tmp, { recursive: true })
  return m
}

// --- encoders (inverses of upstream's unpackers) ---
function varints(values) {
  const bytes = []
  for (let v of values) { if (v < 0) throw new Error('negative varint'); do { let b = v & 0x7f; v = Math.floor(v / 128); if (v > 0) b |= 0x80; bytes.push(b) } while (v > 0) }
  return Buffer.from(bytes).toString('base64')
}
// unpackTable's format: varint(length), then literal runs each followed by a back-copy. Greedy LZ77.
function packTable(bytes) {
  const out = []
  const vi = v => { do { let b = v & 0x7f; v = Math.floor(v / 128); if (v > 0) b |= 0x80; out.push(b) } while (v > 0) }
  vi(bytes.length)
  let lit = [], i = 0
  const n = bytes.length
  while (i < n) {
    let bestLen = 0, bestDist = 0
    for (let j = Math.max(0, i - 4096); j < i; j++) {
      let l = 0; while (i + l < n && bytes[j + l] === bytes[i + l] && l < 4096) l++
      if (l > bestLen) { bestLen = l; bestDist = i - j }
    }
    if (bestLen >= 6) { vi(lit.length); out.push(...lit); lit = []; vi(bestLen - 4); vi(bestDist); i += bestLen }
    else lit.push(bytes[i++])
  }
  if (lit.length) { vi(lit.length); out.push(...lit) }
  return Buffer.from(out).toString('base64')
}
function encodeStateRows(rows, width) {
  const states = rows.length / width
  const d = []
  let lastRow = -1
  for (let r = 0; r < states; r++) {
    const row = rows.subarray(r * width, r * width + width)
    // best start: zeros or a copy of an earlier row
    const diffCount = base => { let c = 0; for (let k = 0; k < width; k++) if (row[k] !== (base ? base[k] : 0)) c++; return c }
    let back = 0, best = diffCount(null)
    for (let p = 0; p < r && best > 0; p++) { const c = diffCount(rows.subarray(p * width, p * width + width)); if (c < best - 1) { best = c; back = r - p } }
    if (best === 0 && back === 0) continue
    const base = back ? rows.subarray((r - back) * width, (r - back) * width + width) : null
    d.push(r - lastRow - 1, back, diffCount(base))
    let at = -1
    for (let k = 0; k < width; k++) if (row[k] !== (base ? base[k] : 0)) { d.push(k - at - 1, row[k]); at = k }
    lastRow = r
  }
  return varints(d)
}

function inAlphabet(alphabet) {
  if (!alphabet) return () => true
  return c => { for (const [lo, hi] of alphabet) if (c >= lo && c <= hi) return true; return false }
}

export async function genEngineData({ upstreamDir, engine, alphabet = null }) {
  const U = await loadUpstream(upstreamDir)
  const D = U.D
  const runs = U.unpackVarints(D.classRunsVarints), remaps = U.unpackTable(D.classRemapsPacked)
  const full = {}
  const cls = (map) => {
    if (full[map]) return full[map]
    const [row, blocks] = D.classMaps[map]
    const t = U.unpackClassRuns(runs, remaps.subarray(row * D.jointClassCount), blocks)
    const a = new Uint8Array(0x110000)
    for (let c = 0; c < 0x110000; c++) a[c] = t.values[(t.index[c >> 8] << 8) | (c & 0xff)]
    return full[map] = a
  }
  const inA = inAlphabet(alphabet)
  const maps = MAPS[engine]
  const perMap = {}
  for (const m of maps) perMap[m] = cls(m).slice()

  // --- rule tables: prune states / categories
  const ruleTables = {}
  const allowedTables = new Set(RULES[engine])
  // Apple quote overrides read the categories of U+007B and U+007D, which are in every alphabet here.
  for (const t of RULES[engine]) {
    const [catCount, dictStart, laSize, states, base] = D.ruleTables[t]
    const width = catCount + 3
    const rowsOf = (tt) => { const [cc, , , st, b, diff] = D.ruleTables[tt]; return U.unpackStateRows(cc + 3, st, b === null ? null : rowsOf(b), U.unpackVarints(diff)) }
    const rows = rowsOf(t)
    const map = perMap[t]
    if (!alphabet) { ruleTables[t] = { catCount, dictStart, laSize, rows, width, remapCat: null }; continue }
    const used = new Set([0, 1, 2])
    for (let c = 0; c < 0x110000; c++) if (inA(c)) used.add(map[c])
    const cats = [...used].sort((a, b) => a - b)
    // keep dictionary categories last, so `>= dictStart` still means dictionary
    const plain = cats.filter(c => c < dictStart), dict = cats.filter(c => c >= dictStart)
    const order = [...plain, ...dict]
    const newCat = new Map(order.map((c, i) => [c, i]))
    for (const c of [0, 1, 2]) if (newCat.get(c) !== c) throw new Error('special categories moved')
    // reachable states
    const seen = new Map([[0, 0], [1, 1]]), queue = [1]
    while (queue.length) {
      const s = queue.shift()
      for (const c of order) { const nx = rows[s * width + 3 + c]; if (!seen.has(nx)) { seen.set(nx, seen.size); queue.push(nx) } }
    }
    // Moore minimisation over the kept categories. fTagsIdx (cell 2) is never read by the port, so it is
    // zeroed; fAccepting and fLookAhead are slot numbers and must match exactly. STOP stays 0, START 1.
    const olds = [...seen.keys()]
    let block = new Map(olds.map(o => [o, o === 0 ? 'S' : o === 1 ? 'T' : rows[o * width] + ':' + rows[o * width + 1]]))
    for (;;) {
      const sig = new Map(olds.map(o => [o, block.get(o) + '|' + order.map(c => block.get(rows[o * width + 3 + c])).join(',')]))
      const ids = new Map(); const nb = new Map(olds.map(o => { const k = sig.get(o); if (!ids.has(k)) ids.set(k, ids.size); return [o, 'b' + ids.get(k)] }))
      const count = new Set(nb.values()).size, prev = new Set(block.values()).size
      block = nb
      if (count === prev) break
    }
    const num = new Map([[block.get(0), 0], [block.get(1), 1]])
    for (const o of olds) if (!num.has(block.get(o))) num.set(block.get(o), num.size)
    const nw = order.length + 3
    const nrows = new Uint16Array(num.size * nw)
    for (const o of olds) {
      const nu = num.get(block.get(o))
      nrows[nu * nw] = rows[o * width]; nrows[nu * nw + 1] = rows[o * width + 1]; nrows[nu * nw + 2] = 0
      order.forEach((c, i) => { nrows[nu * nw + 3 + i] = num.get(block.get(rows[o * width + 3 + c])) })
    }
    // Merge categories whose columns are identical in every kept state (never 0..2, never across the
    // dictionary boundary). The class map then gives both the same category.
    const S = num.size, colKey = i => { let k = (i >= plain.length ? 'd' : 'p'); for (let r = 0; r < S; r++) k += ',' + nrows[r * nw + 3 + i]; return k }
    const keep = [], merged = new Map()
    for (let i = 0; i < order.length; i++) {
      const k = colKey(i)
      // categories the port reads by value (Gecko's skipped U+00AD, Apple's quote overrides) stay apart
      const isProtected = q => [0x7b, 0x7d, 0xad].some(cp => newCat.get(map[cp]) === q)
      const j = i < 3 || isProtected(i) ? -1 : keep.findIndex(q => q >= 3 && !isProtected(q) && colKey(q) === k)
      if (j >= 0) merged.set(i, j); else { merged.set(i, keep.length); keep.push(i) }
    }
    const mw = keep.length + 3, mrows = new Uint16Array(S * mw)
    for (let r = 0; r < S; r++) { mrows[r * mw] = nrows[r * nw]; mrows[r * mw + 1] = nrows[r * nw + 1]; keep.forEach((i, ni) => { mrows[r * mw + 3 + ni] = nrows[r * nw + 3 + i] }) }
    const dictStart2 = keep.filter(i => i < plain.length).length
    ruleTables[t] = { catCount: keep.length, dictStart: dictStart2, laSize, rows: mrows, width: mw, states: S, oldStates: states, oldCats: catCount }
    for (let c = 0; c < 0x110000; c++) map[c] = inA(c) ? merged.get(newCat.get(map[c])) : 0
  }
  // gecko/char shares chromium/char; apple/line etc. have their own maps
  // --- class maps: out-of-alphabet code points copy the previous in-alphabet class (merges runs)
  if (alphabet) for (const m of maps) {
    if (ruleTables[m]) { // already remapped; fill gaps
      const a = perMap[m]; let prev = 0
      for (let c = 0; c < 0x110000; c++) { if (inA(c)) prev = a[c]; else a[c] = prev }
    } else {
      const a = perMap[m]; let prev = 0
      for (let c = 0; c < 0x110000; c++) { if (inA(c)) prev = a[c]; else a[c] = prev }
    }
  }
  // joint classes
  const tuple = new Map(), joint = new Int32Array(0x110000)
  const tuples = []
  for (let c = 0; c < 0x110000; c++) {
    const key = maps.map(m => perMap[m][c]).join(',')
    let j = tuple.get(key)
    if (j === undefined) { j = tuples.length; tuple.set(key, j); tuples.push(key.split(',').map(Number)) }
    joint[c] = j
  }
  const runList = []
  for (let c = 0; c < 0x110000;) { let e = c; while (e + 1 < 0x110000 && joint[e + 1] === joint[c]) e++; runList.push(e - c, joint[c]); c = e + 1 }
  const jointCount = tuples.length
  const remapBytes = new Uint8Array(maps.length * jointCount)
  maps.forEach((m, mi) => tuples.forEach((t, j) => { remapBytes[mi * jointCount + j] = t[mi] }))
  const classRunsV = varints(runList)
  const classMaps = {}
  for (const [mi, m] of maps.entries()) {
    const t = U.unpackClassRuns(U.unpackVarints(classRunsV), remapBytes.subarray(mi * jointCount), 0x1100)
    let max = 0; for (const v of t.index) if (v > max) max = v
    classMaps[m] = [mi, max + 1]
    // verify
    for (let c = 0; c < 0x110000; c++) if (t.values[(t.index[c >> 8] << 8) | (c & 0xff)] !== perMap[m][c]) throw new Error('class verify failed ' + m)
  }
  // other maps upstream types mention but this engine never reads: alias to map 0 so lookups type-check
  const rt = {}
  for (const [t, r] of Object.entries(ruleTables)) {
    const same = Object.keys(rt).find(o => ruleTables[o].width === r.width && Buffer.compare(Buffer.from(ruleTables[o].rows.buffer), Buffer.from(r.rows.buffer)) === 0 && rt[o][4] === null)
    rt[t] = [r.catCount, r.dictStart, r.laSize, r.rows.length / r.width, same ?? null, same ? '' : encodeStateRows(r.rows, r.width)]
  }
  // verify rows round-trip
  for (const [t, r] of Object.entries(ruleTables)) { const back = U.unpackStateRows(r.width, r.rows.length / r.width, rt[t][4] ? ruleTables[rt[t][4]].rows : null, U.unpackVarints(rt[t][5])); if (Buffer.compare(Buffer.from(back.buffer), Buffer.from(r.rows.buffer))) throw new Error('rows verify ' + t) }
  const remapsPacked = packTable(remapBytes)
  if (Buffer.compare(Buffer.from(U.unpackTable(remapsPacked)), Buffer.from(remapBytes))) throw new Error('pack verify')
  const stats = Object.fromEntries(Object.entries(ruleTables).map(([t, r]) => [t, { cats: `${r.oldCats ?? r.catCount}->${r.catCount}`, states: `${r.oldStates ?? r.rows.length / r.width}->${r.rows.length / r.width}` }]))
  const J = JSON.stringify
  const src = [
    `// Generated by text-engine/scripts/gendata.mjs from @chenglou/pretext's src/generated/engine-break-data.ts`,
    `// (MIT, Cheng Lou; tables derived from ICU/Unicode data, see LICENSE). Engine: ${engine}. ${alphabet ? 'Restricted to the base alphabet: exact only for text whose code points are all in it.' : 'Full alphabet.'}`,
    `export const classMaps = ${J(classMaps)}`,
    `export const jointClassCount = ${jointCount}`,
    `export const classRunsVarints = ${J(classRunsV)}`,
    `export const classRemapsPacked = ${J(remapsPacked)}`,
    `export const scriptClassFacts = ${J(D.scriptClassFacts)}`,
    `export const ruleTables = ${J(rt)}`,
    engine === 'blink' ? `export const blinkLinePairsPacked = ${J(D.blinkLinePairsPacked)}` : `export const blinkLinePairsPacked = ''`,
    engine === 'webkit' ? `export const webkitLinePairsPacked = ${J(D.webkitLinePairsPacked)}` : `export const webkitLinePairsPacked = ''`,
    engine === 'webkit' ? `export const appleQuoteRemaps = ${J(D.appleQuoteRemaps)}` : `export const appleQuoteRemaps = {}`,
    engine === 'gecko' ? `export const geckoLinePropertyCount = ${D.geckoLinePropertyCount}\nexport const geckoLineLastCodepointProperty = ${D.geckoLineLastCodepointProperty}\nexport const geckoLineEotProperty = ${D.geckoLineEotProperty}\nexport const geckoLineBreakStatesPacked = ${J(D.geckoLineBreakStatesPacked)}` : `export const geckoLinePropertyCount = 0\nexport const geckoLineLastCodepointProperty = 0\nexport const geckoLineEotProperty = 0\nexport const geckoLineBreakStatesPacked = ''`,
  ].join('\n') + '\n'
  return { src, stats, jointCount, runs: runList.length / 2 }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [engine, alpha] = process.argv.slice(2)
  const BASE = JSON.parse(fs.readFileSync(new URL('./alphabet.json', import.meta.url)))
  const r = await genEngineData({ upstreamDir: 'upstream', engine, alphabet: alpha === 'base' ? BASE : null })
  console.log(engine, alpha, r.stats, 'joint', r.jointCount, 'runs', r.runs, 'bytes', r.src.length)
}
