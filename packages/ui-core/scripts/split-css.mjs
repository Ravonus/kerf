// Splits the finished warp CSS (docs/design/warp/tokens) into one file per component, so importing one component
// ships only its own rules. Nothing is restyled: every rule is copied byte for byte, and a rule's order relative to
// the other rules in its file is the spec's order.
//
//   node scripts/split-css.mjs           write styles/
//   node scripts/split-css.mjs --check   exit 1 if styles/ differs from what the spec would produce
//
// warp.css (tokens, base, signature) ships whole as styles/warp.css. warp-components.css splits at its
// `/* -- Name` headers; warp-inputs.css at its numbered sections. Rules before the first header (sweep tokens, tone
// plumbing) go to the family's base file, which every component in the family imports first. The cross-cutting tail
// sections (reduced motion, forced colours, touch targets) restate rules for many components and must load after
// them, so each of their rules moves to the end of the file that owns the [data-scope] it names.
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const spec = join(root, '../../docs/design/warp/tokens')
const out = join(root, 'styles')

// marker text → file. Anything not named here gets a slug from its first words.
const NAMES = {
  frame: 'button', 'Badge + status dot': 'badge', 'Alert (inline), Banner (page), Callout (prose)': 'alert',
  'Select-like listbox': 'listbox', 'Toggle button / toggle group': 'toggle-button', 'Copy action': 'copy',
  'Modal backdrop as a part': 'dialog', 'Command palette': 'command-palette', 'Context menu target': 'menu',
  'Hover card': 'popover', 'Skeleton scope': 'skeleton', 'Number / relative time': 'number', 'Avatar + avatar group': 'avatar',
  'Empty / error state': 'empty-state', 'Accordion / disclosure': 'accordion', 'Theme toggle': 'theme-toggle',
  'Live status': 'live-status', 'Icon gallery': 'icon', 'Item row': 'item-row', 'Status light': 'status-light',
  'Section message': 'section-message', 'Highlight / mark': 'highlight', 'Speed dial': 'speed-dial',
  'Selection toolbar': 'selection-toolbar', 'Tour step': 'tour', 'AI label': 'ai-label', 'Theme panel': 'theme-panel',
  'QR code': 'qr-code', 'Stopwatch / elapsed timer': 'countdown', 'Countdown timer': 'countdown', 'Meta list': 'meta-list',
  'Button group': 'button-group', 'appearance: line': 'field',
}
const SECTIONS = { // numbered section headers (inputs) → file
  'THE SWEEP ON INPUT': 'field', 'THE FIELD, EXTENDED FOR INPUTS': 'field', 'TEXT FAMILY EXTRAS': 'text',
  'CHOICE FAMILY': 'choice', 'POPUP + LISTBOX': 'listbox', 'RANGE FAMILY': 'range', 'FILE FAMILY': 'file',
  'FORM LAYOUT': 'form', 'MORE PICKERS AND FORM MECHANICS': 'pickers',
}
const TAIL = /^(Reduced motion|forced colours|TOUCH TARGETS)/
const slug = text => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// Top-level items inside the file's one @layer block: comments, whitespace and balanced rules, in order.
function items(css) {
  const open = css.search(/@layer [\w.]+ \{/)
  const start = css.indexOf('{', open) + 1
  const { list, end } = body(css, start)
  return { layer: css.slice(open, start).match(/@layer ([\w.]+)/)[1], list, end }
}

// Items of a block body from `start` up to its closing brace.
function body(css, start) {
  const list = []
  let i = start
  while (i < css.length) {
    if (/\s/.test(css[i])) { const j = css.slice(i).search(/\S/); list.push({ kind: 'space', text: css.slice(i, j < 0 ? css.length : i + j) }); i += list.at(-1).text.length; continue }
    if (css.startsWith('/*', i)) { const j = css.indexOf('*/', i) + 2; list.push({ kind: 'comment', text: css.slice(i, j) }); i = j; continue }
    if (css[i] === '}') return { list, end: i }
    let depth = 0, j = i, quote = null
    for (; j < css.length; j++) {
      const c = css[j]
      if (quote) { if (c === '\\') j++; else if (c === quote) quote = null; continue }
      if (c === '"' || c === "'") { quote = c; continue }
      if (css.startsWith('/*', j)) { j = css.indexOf('*/', j) + 1; continue }
      if (c === '{') depth++
      if (c === '}' && --depth === 0) break
    }
    list.push({ kind: 'rule', text: css.slice(i, j + 1) })
    i = j + 1
  }
  throw new Error('unterminated block')
}

// the [data-scope]s a rule styles, plus the two behaviours keyed by a bare attribute ([data-copy], [data-hamburger])
const scopesOf = text => [...new Set([...text.matchAll(/data-scope="([\w-]+)"|\[data-(copy|hamburger)\]/g)].map(m => m[1] ?? m[2]))]

function split(file, family) {
  const css = readFileSync(join(spec, file), 'utf8')
  const { layer, list } = items(css)
  const files = new Map() // name → items
  const owner = new Map() // data-scope → file that first styles it
  const tail = []
  let current = 'base', inTail = false
  for (const item of list) {
    if (item.kind === 'comment') {
      const body = item.text.slice(2, -2).trim()
      const marker = body.match(/^-- +([^-\n][^\n]*)/)
      const section = body.match(/^[-=]{8,}\s*\n\s*(?:\d+|[A-Z]) · ([^\n.(]*)/) ?? body.match(/^[-=]{8,}\s*([A-Z][A-Z ]+)/) ?? body.match(/^-{8,}\s*(forced colours)/)
      const title = marker?.[1].replace(/[-\s*/]+$/, '') ?? section?.[1].trim()
      if (title && TAIL.test(title)) inTail = true
      else if (marker && !inTail) {
        const named = Object.keys(NAMES).find(k => title === k || title.startsWith(`${k}:`) || title.startsWith(`${k} (`) || title.startsWith(`${k}.`))
        current = named ? NAMES[named] : slug(title.split(/[(:,.+/—]| - /)[0])
      } else if (section && !inTail) {
        const key = Object.keys(SECTIONS).find(k => title.startsWith(k))
        if (key) current = SECTIONS[key]
      }
    }
    if (inTail) { tail.push(item); continue }
    if (!files.has(current)) files.set(current, [])
    files.get(current).push(item)
    if (item.kind === 'rule' && current !== 'base') for (const s of scopesOf(item.text)) if (!owner.has(s)) owner.set(s, current)
  }
  // Tail rules follow the component they restate (comments and space ride with the next rule). A rule naming several
  // components' scopes is copied to each: these are final overrides, so a second identical copy changes nothing.
  // An @media block is split the same way, each owner getting its own copy of the wrapper.
  const shared = []
  const homesOf = text => {
    const homes = new Set(scopesOf(text).map(s => owner.get(s)).filter(Boolean))
    return homes.size ? [...homes] : ['base']
  }
  const place = (home, list) => (home === 'base' ? shared : files.get(home)).push({ kind: 'space', text: '\n' }, ...list)
  let pending = []
  for (const item of tail) {
    if (item.kind !== 'rule') { pending.push(item); continue }
    if (/^@media|^@supports/.test(item.text)) {
      const open = item.text.indexOf('{') + 1
      const inner = body(item.text, open).list
      const byHome = new Map()
      let before = []
      for (const i of inner) {
        if (i.kind !== 'rule') { before.push(i); continue }
        for (const h of homesOf(i.text)) (byHome.get(h) ?? byHome.set(h, []).get(h)).push(...before, i)
        before = []
      }
      for (const [h, list] of byHome) place(h, [...pending, { kind: 'rule', text: `${item.text.slice(0, open)}\n${list.map(i => i.text).join('').trim()}\n}`, inner: list.filter(i => i.kind === 'rule').map(i => i.text) }])
    } else for (const h of homesOf(item.text)) place(h, [...pending, item])
    pending = []
  }
  return { layer, family, files, shared }
}

function render({ layer, family, files, shared }) {
  const result = new Map()
  for (const [name, list] of files) {
    const body = list.map(i => i.text).join('').trim()
    if (!list.some(i => i.kind === 'rule')) continue
    result.set(`${family}/${name}.css`, `/* generated from docs/design/warp/tokens by ui-core/scripts/split-css.mjs: do not edit */\n@layer ${layer} {\n${body}\n}\n`)
  }
  // cross-cutting tail rules no single component owns load once, from the family base, after its own rules
  const tail = shared.map(i => i.text).join('').trim()
  if (tail) result.set(`${family}/tail.css`, `/* generated from docs/design/warp/tokens by ui-core/scripts/split-css.mjs: do not edit */\n@layer ${layer} {\n${tail}\n}\n`)
  return result
}

export function build() {
  const files = new Map([['warp.css', readFileSync(join(spec, 'warp.css'), 'utf8')]])
  const parts = { components: split('warp-components.css', 'components'), inputs: split('warp-inputs.css', 'inputs') }
  for (const p of Object.values(parts)) for (const [k, v] of render(p)) files.set(k, v)
  const scopes = {}
  for (const p of Object.values(parts)) for (const [name, list] of p.files) for (const i of list) if (i.kind === 'rule') for (const s of scopesOf(i.text)) (scopes[s] ??= new Set()).add(`${p.family}/${name}.css`)
  files.set('manifest.json', JSON.stringify(Object.fromEntries(Object.entries(scopes).sort().map(([k, v]) => [k, [...v]])), null, 1) + '\n')
  return { files, parts }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { files } = build()
  const read = dir => readdirSync(dir, { recursive: true, withFileTypes: true }).filter(d => d.isFile()).map(d => join(d.parentPath, d.name))
  if (process.argv.includes('--check')) {
    let stale = []
    try { for (const [k, v] of files) if (readFileSync(join(out, k), 'utf8') !== v) stale.push(k) } catch (e) { stale.push(e.path) }
    const extra = read(out).map(p => p.slice(out.length + 1)).filter(p => !files.has(p))
    if (stale.length || extra.length) { console.error(`styles/ is stale (${[...stale, ...extra].join(', ')}): run node scripts/split-css.mjs`); process.exit(1) }
  } else {
    rmSync(out, { recursive: true, force: true })
    for (const [k, v] of files) { mkdirSync(dirname(join(out, k)), { recursive: true }); writeFileSync(join(out, k), v) }
    console.log(`wrote ${files.size} files to styles/`)
  }
}
