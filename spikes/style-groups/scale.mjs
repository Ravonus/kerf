#!/usr/bin/env node
// How the groups CSS overhead scales past the 10-group shop (research 23 §6.6). Synthetic: N groups drawn from the
// vocabulary with a fixed seed (a base, 0–3 parts, 0–2 axes of 2–4 values half of them tones, some hover states and
// compounds), every value used at a call site. The baseline is the same rules with BEM class selectors (`.x`,
// `.x__part`, `.x--axis-value`, `.is-state`): the stylesheet a hand author writes for those exact declarations, so the
// difference is the cost of the attribute selectors and @scope preludes alone. A hand author also shares and trims
// across components, which the shop measures and this doesn't.
//
//   node spikes/style-groups/scale.mjs
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync } from 'node:zlib'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const { transform: minify } = createRequire(join(repo, 'evals/frameworks/weft/package.json'))('lightningcss')
const { emitGroups } = await import(join(repo, 'packages/weft/src/style/css.ts'))
const { VOCAB } = await import(join(repo, 'packages/weft/src/style/vocab.ts'))

let seed = 7
const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
const pick = xs => xs[Math.floor(rand() * xs.length)]
const nouns = ['card', 'row', 'panel', 'badge', 'list', 'item', 'header', 'footer', 'menu', 'tile', 'chip', 'note', 'banner', 'field', 'meter', 'summary']
const partNames = ['title', 'meta', 'icon', 'label', 'value', 'action', 'body', 'media', 'count', 'hint']
const keys = Object.keys(VOCAB).filter(k => k !== 'tone' && k !== 'emphasis' && k !== 'ink')
const intent = n => Object.fromEntries(Array.from({ length: n }, () => { const k = pick(keys); return [k, pick(Object.keys(VOCAB[k]))] }))
const toned = () => ({ tone: pick(Object.keys(VOCAB.tone)) })

function synth(n) {
  const groups = []
  const uses = []
  for (let i = 0; i < n; i++) {
    const name = `${pick(nouns)}-${pick(nouns)}-${i}`
    const parts = Object.fromEntries([...new Set(Array.from({ length: Math.floor(rand() * 4) }, () => pick(partNames)))].map(p => [p, { ...intent(1 + Math.floor(rand() * 3)), ...(rand() < 0.3 ? { ink: 'tone' } : {}) }]))
    const partList = Object.keys(parts)
    const axes = {}
    for (let a = 0; a < Math.floor(rand() * 3); a++) {
      const tones = rand() < 0.5
      axes[['status', 'size', 'kind'][a]] = Object.fromEntries(Array.from({ length: 2 + Math.floor(rand() * 3) }, (_, v) => [`v${v}`, tones ? toned() : intent(1)]))
    }
    const compounds = Object.entries(axes).flatMap(([a, vals]) => (partList.length && rand() < 0.5 ? [{ when: { [a]: 'v1' }, part: pick(partList), set: intent(1) }] : []))
    const tonedBase = rand() < 0.4 || Object.values(axes).some(vals => 'tone' in Object.values(vals)[0])
    const base = { ...intent(3 + Math.floor(rand() * 4)), ...(tonedBase ? { ...toned(), emphasis: pick(['soft', 'solid', 'ghost', 'outline']) } : {}) }
    const states = rand() < 0.4 ? { hover: intent(1) } : {}
    const defaults = Object.fromEntries(Object.keys(axes).map(a => [a, 'v0']))
    groups.push({ name, def: { base, axes, parts, states, compounds, defaults }, file: 'synthetic.tsx', line: i + 1 })
    uses.push({ group: name, axes: Object.fromEntries(Object.keys(axes).map(a => [a, null])), states: [], part: null, dynamic: true })
    for (const p of partList) uses.push({ group: name, axes: {}, states: [], part: p, dynamic: false })
  }
  return { groups, uses }
}

/** Flat tagged-parts group CSS rewritten as BEM classes: the same rules and declarations, class selectors. */
const bem = css =>
  css
    .replaceAll(':not([data-part])', '')
    .replace(/\[data-g="([\w-]+)"\]\[data-part="([\w-]+)"\]/g, '.$1__$2')
    .replace(/\[data-g="([\w-]+)"\]((?:\[data-[\w-]+="[\w-]+"\])+)/g, (_, g, conds) => `.${g}${[...conds.matchAll(/\[data-([\w-]+)="([\w-]+)"\]/g)].map(([, a, v]) => `.${g}--${a}-${v}`).join('')}`)
    .replace(/\[data-g="([\w-]+)"\]/g, '.$1')
    .replace(/\[data-([\w-]+)="([\w-]+)"\]/g, '.--$1-$2')
    .replace(/\[aria-([\w-]+)="true"\]/g, '.is-$1')

const br = css => brotliCompressSync(minify({ filename: 'x.css', code: Buffer.from(css), minify: true }).code).length
const rows = []
for (const n of [10, 30, 100, 300]) {
  seed = 7
  const { groups, uses } = synth(n)
  const flat = emitGroups(groups, uses, { scope: false, taggedParts: true })
  const miss = bem(flat).match(/[^{}]*\[data-(g|part)[^{]*/)
  if (miss) throw new Error(`BEM rewrite missed a selector: ${miss[0]}`)
  rows.push({ groups: n, bem: br(bem(flat)), groups_br: br(emitGroups(groups, uses)), flat_tagged: br(flat) })
}
console.log('groups    BEM br   groups br (default)   overhead   flat tagged br')
for (const r of rows) console.log(String(r.groups).padStart(6), String(r.bem).padStart(9), String(r.groups_br).padStart(11), ' '.repeat(9), `${((r.groups_br / r.bem - 1) * 100).toFixed(1)}%`.padStart(8), String(r.flat_tagged).padStart(10))
// Calibration on the real shop (run.mjs writes out/): the same BEM rewrite of its rules, against the groups build.
const shop = br(bem(readFileSync(join(repo, 'spikes/style-groups/out/groups.flat.css'), 'utf8')))
console.log(`shop: BEM rewrite ${shop} B br, groups ${br(readFileSync(join(repo, 'spikes/style-groups/out/groups.dev.css'), 'utf8'))} B br, hand 762 B br`)
if (process.argv.includes('--dump')) {
  seed = 7
  const { groups, uses } = synth(10)
  console.log(emitGroups(groups, uses, { dev: true }), bem(emitGroups(groups, uses, { scope: false, taggedParts: true, dev: true })))
}
export { rows }
