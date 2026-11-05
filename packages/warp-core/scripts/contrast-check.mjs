#!/usr/bin/env node
// warp contrast check: parses tokens/warp.css, resolves every sys colour for each
// theme × expression, and checks the text/fill, UI and focus-ring pairs against
// WCAG 2.x. Plain Node, no dependencies.
//
//   node scripts/contrast-check.mjs            summary + failures (exit 1 on any failure)
//   node scripts/contrast-check.mjs --full     every pair, every combination
//   node scripts/contrast-check.mjs --md       markdown summary (pasted into 01-foundations.md)
//   node scripts/contrast-check.mjs --json     resolved colours + results
//   node scripts/contrast-check.mjs path/to/other.css
//
// It also reads the sibling component files (tokens/warp-*.css) for every rule that re-points a
// control's resting border (--_base / --warp-color-sweep-base) and checks the full-accent sweep
// against that base (review 03 M9): fields and controls need sweep-vs-base >= 3:1. Surfaces
// (cards, panels, stat tiles) may rest on the hairline (SIGNATURE, surfaces exception).

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  parseBlocks,
  splitTop,
  resolveEnv,
  substitute,
  toLab,
  fromLab,
  fromSrgb,
  over,
  ratio,
  luminance,
  toHex,
  toLinearSrgb,
  suggest,
} from './contrast-check-colors.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const flag = (f) => args.includes(f)
const cssPath = args.find((a) => !a.startsWith('--')) ?? resolve(here, '../tokens/warp.css')
const css = readFileSync(cssPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

const THEMES = ['light', 'dark']
const EXPRESSIONS = ['quiet', 'balanced', 'vivid']

// Match a selector against the root element carrying env attributes.
// Returns specificity (number) or -1. Only compound selectors on the root count.
function matchSelector(sel, attrs) {
  let best = -1
  for (const raw of splitTop(sel, ',')) {
    const s = raw.trim()
    if (/[\s>+~]/.test(s.replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)/g, ''))) continue
    const r = matchCompound(s, attrs)
    if (r > best) best = r
  }
  return best
}
function matchCompound(s, attrs) {
  let spec = 0,
    rest = s
  const take = (re) => {
    const m = rest.match(re)
    if (m) rest = rest.slice(m[0].length)
    return m
  }
  while (rest.length) {
    let m
    if ((m = take(/^:root/))) spec += 1
    else if ((m = take(/^:where\(([^)]*)\)/))) {
      if (matchSelector(m[1], attrs) < 0) return -1
    } else if ((m = take(/^:not\(\[([\w-]+)(?:="([^"]*)")?\]\)/))) {
      if (attrTest(attrs, m[1], m[2])) return -1
      spec += 1
    } else if ((m = take(/^\[([\w-]+)(?:="([^"]*)")?\]/))) {
      if (!attrTest(attrs, m[1], m[2])) return -1
      spec += 1
    } else return -1
  }
  return spec
}
const attrTest = (a, k, v) => (v === undefined ? k in a : a[k] === v)

const num = (expr) => {
  const e = expr
    .replace(/calc\(/g, '(')
    .replace(/\b(min|max)\(/g, 'Math.$1(')
    .trim()
  if (!/^(?:[\d.\s+\-*/(),e%]|Math\.min|Math\.max)+$/.test(e))
    throw new Error('not numeric: ' + expr)
  if (e.endsWith('%')) return Number(e.slice(0, -1)) / 100
  return Function(`"use strict";return (${e});`)()
}

function parseColor(str) {
  const s = str.trim()
  let m
  if ((m = s.match(/^color-mix\(\s*in\s+oklab\s*,([\s\S]*)\)$/))) {
    const [a, b] = splitTop(m[1], ',').map((x) => x.trim())
    const pct = (x) => {
      const k = x.match(/\s([\d.]+)%$/)
      return k ? [x.slice(0, k.index).trim(), Number(k[1]) / 100] : [x, null]
    }
    let [ca, pa] = pct(a),
      [cb, pb] = pct(b)
    if (pa === null && pb === null) pa = pb = 0.5
    else if (pa === null) pa = 1 - pb
    else if (pb === null) pb = 1 - pa
    const A = parseColor(ca),
      B = parseColor(cb)
    if (A.lin || B.lin) throw new Error('color-mix needs oklch operands: ' + s)
    const la = toLab(A),
      lb = toLab(B),
      t = pa + pb
    const mixed = fromLab(la.map((v, i) => (v * pa + lb[i] * pb) / t))
    return { ...mixed, alpha: 1 }
  }
  if ((m = s.match(/^oklch\(([\s\S]*)\)$/))) {
    const [main, alpha] = splitTop(m[1], '/')
    const [L, C, H] = splitTop(main.trim().replace(/\s+/g, ' '), ' ').filter(Boolean).map(num)
    return { L, C, H, alpha: alpha ? num(alpha) : 1 }
  }
  if ((m = s.match(/^#([0-9a-f]{6})$/i))) {
    const n = parseInt(m[1], 16)
    return fromSrgb([(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255])
  }
  throw new Error('unsupported colour: ' + s)
}

function resolveColor(name, vars, theme, warnings, combo) {
  const raw = vars.get(name)
  if (raw === undefined) throw new Error(`${name} not defined`)
  const c = parseColor(substitute(raw, vars, theme))
  if (c.lin) return { ...c, hex: toHex(c.lin) }
  const { rgb, clipped } = toLinearSrgb(c)
  if (clipped)
    warnings.add(
      `${combo} ${name} oklch(${c.L} ${c.C.toFixed(3)} ${c.H}) is outside sRGB; chroma mapped`,
    )
  return { ...c, lin: rgb, hex: toHex(rgb) }
}

// ------------------------------------------------------------------ the pairs
const T = '--warp-color-'
const SURFACES = [
  'page',
  'surface',
  'surface-raised',
  'surface-overlay',
  'surface-sunken',
  'surface-hover',
]
const TONES = ['neutral', 'accent', 'positive', 'caution', 'critical', 'info', 'highlight']
const pairs = []
for (const fg of ['text', 'text-subtle'])
  for (const bg of SURFACES) pairs.push({ group: 'Text on surfaces', fg, bg, min: 4.5 })
// text-faint is the third ink (meta, timestamps). It may carry information, so it is held to text contrast
// on every surface text sits on (review 03 M8); disabled ink is opacity, not faint.
for (const bg of ['page', 'surface', 'surface-raised', 'surface-overlay', 'surface-sunken'])
  pairs.push({ group: 'Faint text (meta, AA)', fg: 'text-faint', bg, min: 4.5 })
pairs.push({ group: 'Text on surfaces', fg: 'on-inverse', bg: 'surface-inverse', min: 4.5 })
for (const bg of ['page', 'surface', 'surface-raised', 'surface-sunken'])
  pairs.push({ group: 'Control boundary', fg: 'border-control', bg, min: 3 })
for (const bg of ['page', 'surface', 'surface-raised', 'surface-overlay', 'surface-sunken'])
  pairs.push({ group: 'Focus ring', fg: 'focus', bg, min: 3 })
for (const t of TONES) {
  pairs.push({ group: 'On-solid ink', fg: `${t}-on-solid`, bg: `${t}-solid`, min: 4.5 })
  pairs.push({ group: 'On-solid ink', fg: `${t}-on-solid`, bg: `${t}-solid-hover`, min: 4.5 })
  for (const bg of ['page', 'surface', 'surface-raised', 'surface-sunken', `${t}-soft`])
    pairs.push({ group: 'Tone text (on surfaces + own soft)', fg: `${t}-text`, bg, min: 4.5 })
}
// pressed state layer (--warp-state-press, ink at 11% over the fill): ink must still pass
for (const t of TONES)
  pairs.push({
    group: 'Pressed state layer',
    fg: `${t}-text`,
    bg: `${t}-soft+${t}-text@0.11`,
    min: 4.5,
  })
for (const bg of ['surface', 'surface-raised'])
  pairs.push({ group: 'Pressed state layer', fg: 'text', bg: `${bg}+text@0.11`, min: 4.5 })
for (const bg of ['page', 'surface', 'surface-raised'])
  pairs.push({ group: 'Accent fill as UI (checkbox, switch)', fg: 'accent-solid', bg, min: 3 })
// signature: sweep stroke + resting border are the field's boundary (UI ≥ 3:1);
// the floated label sits in the notch on the field's background (text ≥ 4.5:1)
for (const bg of ['page', 'surface', 'surface-raised', 'field', 'field-active']) {
  pairs.push({ group: 'Sweep stroke + resting border (UI)', fg: 'sweep', bg, min: 3 })
  pairs.push({ group: 'Sweep stroke + resting border (UI)', fg: 'sweep-base', bg, min: 3 })
}
for (const bg of ['page', 'surface', 'surface-raised', 'field-invalid'])
  pairs.push({ group: 'Sweep stroke + resting border (UI)', fg: 'sweep-critical', bg, min: 3 })
// the sweep must read against what it replaces: accent stroke vs ink base, ≥ 3:1 at every stop
// (a 1px dark-on-dark swap reads as "no change"); and vs every surface a field sits on
pairs.push({
  group: 'Sweep vs resting border (visible swap)',
  fg: 'sweep',
  bg: 'sweep-base',
  min: 3,
})
pairs.push({
  group: 'Sweep vs resting border (visible swap)',
  fg: 'sweep',
  bg: 'surface-sunken',
  min: 3,
})
for (const fg of ['label-rest', 'label-active', 'critical-text'])
  for (const bg of ['page', 'surface', 'surface-raised', 'surface-sunken'])
    pairs.push({ group: 'Floating label (notch + field)', fg, bg, min: 4.5 })
for (const fg of ['text', 'label', 'label-active'])
  for (const bg of ['field', 'field-active', 'field-invalid'])
    pairs.push({ group: 'Floating label (notch + field)', fg, bg, min: 4.5 })
for (const fg of ['label-rest', 'critical-text'])
  pairs.push({ group: 'Floating label (notch + field)', fg, bg: 'field', min: 4.5 })
for (let i = 1; i <= 8; i++)
  for (const bg of ['surface', 'page'])
    pairs.push({ group: 'Data-viz marks', fg: `data-${i}`, bg, min: 3 })

// control hosts in the component files: sweep vs the base they actually rest on
const CONTROLS = [
  'field',
  'checkbox',
  'radio',
  'switch',
  'segmented',
  'chip',
  'choice-card',
  'otp',
  'dropzone',
  'quantity',
  'editable',
  'knob',
  'xy-pad',
  'icon-tile',
  'button',
  'select',
  'combobox',
  'command',
  'toggle',
  'toggle-group',
  'slider',
  'date-field',
  'stepper',
  'tag-input',
  'search',
]
const BASE_PROPS = new Set(['--_base', '--warp-color-sweep-base'])
const controlHosts = [],
  advisories = []
if (!args.find((a) => !a.startsWith('--'))) {
  const dir = resolve(here, '../tokens')
  for (const f of readdirSync(dir)
    .filter((n) => /^warp-.+\.css$/.test(n))
    .sort()) {
    const src = readFileSync(resolve(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    for (const d of parseBlocks(src)) {
      if (!BASE_PROPS.has(d.prop)) continue
      const tok = d.value.match(/^var\(--warp-color-([\w-]+)\)$/)
      if (!tok || !/^(border|border-strong|border-control|text-subtle|text-faint)$/.test(tok[1]))
        continue // ink, accent or transparent: fine
      const scopes = [...d.selector.matchAll(/data-scope="([\w-]+)"/g)].map((m) => m[1])
      const part = d.selector.match(/data-part="(switcher|command|trigger)"/)?.[1]
      const scope =
        scopes.find((x) => CONTROLS.includes(x)) ||
        (part && `${scopes.at(-1) ?? ''} ${part}`.trim())
      if (
        !scope ||
        (!part &&
          scopes.some(
            (x) => /surface|card|panel|stat|tile|kanban|plan/.test(x) && !CONTROLS.includes(x),
          ))
      )
        continue
      // a control *part* (shell switcher, command trigger) is advisory: it has a visible label (review 03 m13)
      if (part) {
        advisories.push(
          `${f} ${scope} rests on ${tok[1]}; sweep-vs-base below 3:1 (advisory, labelled control)`,
        )
        continue
      }
      const key = `${f} ${scope} → ${tok[1]}`
      if (controlHosts.some((h) => h.key === key)) continue
      controlHosts.push({ key, file: f, scope, base: tok[1] })
      pairs.push({
        group: 'Control sweep vs its base (component files)',
        fg: 'sweep',
        bg: tok[1],
        min: 3,
        where: key,
      })
    }
  }
}

// --------------------------------------------------------------------- run it
const decls = parseBlocks(css)
const warnings = new Set()
const results = []
const resolved = {}
for (const theme of THEMES)
  for (const expression of EXPRESSIONS) {
    const combo = `${theme}/${expression}`
    const vars = resolveEnv(
      decls,
      { 'data-theme': theme, 'data-expression': expression },
      matchSelector,
    )
    const cache = new Map()
    const one = (n) =>
      cache.get(n) ?? cache.set(n, resolveColor(T + n, vars, theme, warnings, combo)).get(n)
    // "base+layer@alpha" = layer composited over base (state layers)
    const get = (n) => {
      const m = n.match(/^(.+)\+(.+)@([\d.]+)$/)
      if (!m) return one(n)
      const base = one(m[1]),
        layer = { ...one(m[2]), alpha: Number(m[3]) }
      const lin = over(layer, base)
      return { lin, hex: toHex(lin) }
    }
    resolved[combo] = {}
    for (const p of pairs) {
      const fg = get(p.fg),
        bg = get(p.bg)
      const r = ratio(luminance(over(fg, bg)), luminance(bg.lin))
      resolved[combo][p.fg] = fg.hex
      resolved[combo][p.bg] = bg.hex
      const res = {
        ...p,
        combo,
        theme,
        expression,
        ratio: r,
        pass: r >= p.min,
        fgHex: fg.hex,
        bgHex: bg.hex,
      }
      if (!res.pass) res.suggest = suggest(fg, bg, p.min)
      results.push(res)
    }
  }

const fails = results.filter((r) => !r.pass)
const fmt = (n) => n.toFixed(2)

if (flag('--json')) {
  console.log(JSON.stringify({ file: cssPath, resolved, results }, null, 2))
} else if (flag('--md')) {
  const groups = [...new Set(results.map((r) => r.group))]
  console.log(
    `Checked ${results.length} pairs (${pairs.length} × ${THEMES.length * EXPRESSIONS.length} combinations): ` +
      `**${results.length - fails.length} pass, ${fails.length} fail.**\n`,
  )
  console.log('| Group | Need | Pairs | Lowest | Where | light q/b/v (min) | dark q/b/v (min) |')
  console.log('|---|---|---|---|---|---|---|')
  for (const g of groups) {
    const rs = results.filter((r) => r.group === g)
    const low = rs.reduce((a, b) => (b.ratio < a.ratio ? b : a))
    const col = (th) =>
      EXPRESSIONS.map((e) =>
        fmt(
          Math.min(...rs.filter((r) => r.theme === th && r.expression === e).map((r) => r.ratio)),
        ),
      ).join(' / ')
    console.log(
      `| ${g} | ${low.min}:1 | ${rs.length} | **${fmt(low.ratio)}** | ${low.combo} \`${low.fg}\` on \`${low.bg}\` | ${col('light')} | ${col('dark')} |`,
    )
  }
  if (warnings.size)
    console.log(`\nGamut notes: ${warnings.size} colour(s) chroma-mapped into sRGB.`)
} else {
  for (const combo of Object.keys(resolved)) {
    const rs = results.filter((r) => r.combo === combo)
    const f = rs.filter((r) => !r.pass)
    const low = rs.reduce((a, b) => (b.ratio / b.min < a.ratio / a.min ? b : a))
    console.log(
      `${combo.padEnd(15)} ${String(rs.length - f.length).padStart(3)}/${rs.length} pass   tightest: ${low.fg} on ${low.bg} ${fmt(low.ratio)} (need ${low.min})`,
    )
    if (flag('--full'))
      for (const r of rs)
        console.log(
          `   ${r.pass ? 'ok  ' : 'FAIL'} ${fmt(r.ratio).padStart(6)}  ${r.fg} ${r.fgHex} on ${r.bg} ${r.bgHex}`,
        )
  }
  for (const r of fails)
    console.log(
      `FAIL ${r.combo} ${r.fg} on ${r.bg}: ${fmt(r.ratio)} < ${r.min}  (try ${r.suggest})${r.where ? '  [' + r.where + ']' : ''}`,
    )
  for (const a of new Set(advisories)) console.log('advisory ' + a)
  console.log(
    `control hosts re-pointing their base in component files: ${controlHosts.length ? controlHosts.map((h) => h.key).join('; ') : 'none below ink'}`,
  )
  for (const w of warnings) console.log('note ' + w)
  console.log(`\n${results.length} checks, ${fails.length} failures.`)
}
process.exitCode = fails.length ? 1 : 0 // not process.exit(): lets piped stdout flush
