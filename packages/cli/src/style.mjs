// `weft style find|explain|matrix` and the style D-codes (research 23 §2.4, §3). The matrix comes from the installed
// weft (`@weft-js/core/style/matrix`): the project is scanned with its compiler, so the CLI, the MCP tools and the Vite
// plugin's `.weft/styles.json` agree. D020 (class soup) is found here, on the source text: groups never write a class.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { diagnostic, locate, positions } from './diag.mjs'
import { discover } from './files.mjs'
import { loadConfig } from './load-config.mjs'
import { isTestFile } from './tests.mjs'
import { loadCompiler, resolveWeft } from './weft.mjs'

import { closest, usageError } from './style/find.mjs'

export { closest, findGroups } from './style/find.mjs'

/** The installed weft's matrix module, or null when this weft has no style groups. */
export async function styleModule(weft) {
  const target = weft.pkg.exports?.['./style/matrix']
  if (typeof target !== 'string') return null
  return import(pathToFileURL(join(weft.dir, target)).href)
}

/** Source files that can define or use groups: components and plain modules, not tests. */
export function styleFiles(root, config = {}) {
  const exclude = [...(config.check?.exclude ?? []), ...(config.scope?.forbid ?? [])]
  return discover(root, { include: ['**/*.{ts,tsx,jsx,mts}'], exclude }).filter(
    (f) => !isTestFile(f) && !f.endsWith('.d.ts'),
  )
}

/**
 * Scan the project and build the matrix. `write`: also write `.weft/styles.json` (when the project has groups, or the
 * file is already there).
 */
export async function styleMatrix(root, { write = false } = {}) {
  const weft = resolveWeft(root)
  const mod = await styleModule(weft)
  if (!mod)
    throw Object.assign(
      new Error(`weft@${weft.version} has no style groups (@weft-js/core/style/matrix)`),
      { code: 'E_NO_STYLE' },
    )
  const { config } = await loadConfig(root)
  const compiler = loadCompiler(weft)
  const scan = mod.scanProject(root, styleFiles(root, config), (...a) => compiler.transform(...a))
  const matrix = mod.buildMatrix(scan.groups, scan.uses)
  const file = join(root, '.weft', 'styles.json')
  if (write && (scan.groups.length || existsSync(file))) writeMatrixFile(root, matrix)
  return { matrix, scan, mod, file }
}

export function writeMatrixFile(root, matrix) {
  const file = join(root, '.weft', 'styles.json')
  const text = `${JSON.stringify(matrix, null, 2)}\n`
  if (existsSync(file) && readFileSync(file, 'utf8') === text) return false
  mkdirSync(join(root, '.weft'), { recursive: true })
  writeFileSync(file, text)
  return true
}

const ARIA = new Set(['selected', 'pressed', 'checked', 'expanded', 'current', 'invalid', 'busy'])

/**
 * Read `order-card`, `order-card.title`, `order-card[status=late][selected]`, or a DOM selector
 * (`[data-g="order-card"][data-status="late"] [data-part="title"]`, `[aria-selected="true"]`, `[data-accent~="radius:round"]`).
 */
export function parseTarget(target) {
  const t = (target ?? '').trim()
  if (!t)
    throw usageError(
      'weft style explain <group|selector>: a group name (`order-card`), `order-card.title`, or a selector',
    )
  const out = { group: null, part: null, axes: {}, states: [], accent: {} }
  const head = /^([a-z][\w-]*)(?:\.([\w-]+))?/i.exec(t)
  if (head && !t.startsWith('[')) {
    out.group = head[1]
    out.part = head[2] ?? null
  }
  for (const m of t.matchAll(
    /\[\s*([\w-]+)\s*(?:[~|^$*]?=\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]*)))?\s*\]/g,
  )) {
    const [, attr, ...vals] = m
    const value = vals.find((v) => v !== undefined)
    if (attr === 'data-g') out.group = value
    else if (attr === 'data-part') out.part = value
    else if (attr === 'data-accent')
      for (const w of (value ?? '').split(/\s+/).filter(Boolean)) {
        const [k, v] = w.split(':')
        out.accent[k] = v
      }
    else if (attr.startsWith('aria-')) {
      if (value !== 'false') out.states.push(attr.slice(5))
    } else {
      const name = attr.replace(/^data-/, '')
      if (value === undefined || value === '') out.states.push(name)
      else out.axes[name] = value
    }
  }
  if (!out.group) throw usageError(`weft style explain: no group in \`${t}\``)
  return out
}

/**
 * `weft style explain <target>`: the group, and for the selection (defaults filled in) every declaration on the root
 * and its parts in cascade order, with where each came from, plus the CSS that selection emits.
 * @param {{ axes?: Record<string, string>, states?: string[], accent?: Record<string, string>, part?: string }} [extra]
 */
export function explainTarget({ matrix, scan, mod }, target, extra = {}) {
  const t = parseTarget(target)
  const g = matrix.groups[t.group]
  if (!g) {
    const near = closest(t.group, Object.keys(matrix.groups))
    throw Object.assign(
      new Error(
        `D025 no group \`${t.group}\`${near.length ? `; did you mean ${near.map((n) => `\`${n}\``).join(' or ')}?` : ''} (\`weft style find\` searches by what it is)`,
      ),
      { code: 'E_UNKNOWN_GROUP' },
    )
  }
  const source = scan.groups.find((s) => s.name === t.group)
  // A state written as data-x="…" in a selector, or an axis passed as --x: sort them by what the group has.
  const axes = { ...t.axes, ...extra.axes }
  const states = [...t.states, ...(extra.states ?? [])]
  for (const [k, v] of Object.entries(axes))
    if (!(k in g.axes) && g.states.includes(k) && (v === 'true' || v === '')) {
      delete axes[k]
      states.push(k)
    }
  const selection = {
    axes,
    states: [...new Set(states)],
    accent: { ...t.accent, ...extra.accent },
    part: extra.part ?? t.part ?? undefined,
  }
  let explained
  try {
    explained = mod.explainGroup(source, selection)
  } catch (e) {
    if (e.constructor?.name === 'GroupError')
      throw Object.assign(new Error(`D025 ${e.message}`), { code: 'E_UNKNOWN_NAME' })
    throw e
  }
  const sel = explained.selection
  const sites = g.used.filter(
    (u) =>
      !u.part &&
      Object.entries(sel.axes).every(
        ([a, v]) => !u.axes[a] || u.axes[a] === 'dynamic' || u.axes[a].includes(v),
      ),
  )
  return {
    group: t.group,
    doc: g.doc,
    file: g.file,
    axes: g.axes,
    defaults: g.defaults,
    parts: g.parts,
    states: g.states,
    contextTone: g.contextTone,
    selection: sel,
    attributes: attributesOf(t.group, sel, selection.part),
    elements: explained.elements,
    css: explained.css,
    sites,
    accents: g.accents,
    similar: matrix.similar.filter((s) => s[0] === t.group || s[1] === t.group),
  }
}

/** What the selection looks like in the DOM, as a person would find it in devtools. */
function attributesOf(group, sel, part) {
  const root = [
    `data-g="${group}"`,
    ...Object.entries(sel.axes).map(([a, v]) => `data-${a}="${v}"`),
    ...sel.states.map((s) => (ARIA.has(s) ? `aria-${s}="true"` : `data-${s}`)),
  ]
  const accent = Object.entries(sel.accent)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}:${v}`)
    .join(' ')
  if (accent) root.push(`data-accent="${accent}"`)
  return { root: root.join(' '), ...(part ? { part: `data-part="${part}"` } : {}) }
}

export function formatFind(r) {
  if (!r.groups.length)
    return `no group fits "${r.query}" (${r.total} groups). Define one with group() from @weft-js/core/style; \`weft docs style\` has the rules.`
  const lines = r.groups.map((g) => {
    const axes = Object.entries(g.axes)
      .map(([a, v]) => `${a}: ${Array.isArray(v) ? v.join('|') : v}`)
      .join(' · ')
    return `${g.name.padEnd(18)} ${g.file}${g.doc ? `\n    ${g.doc}` : ''}\n    ${[axes, g.parts.length ? `parts: ${g.parts.join(', ')}` : '', g.states.length ? `states: ${g.states.join(', ')}` : '', `${g.uses} uses`].filter(Boolean).join(' · ')}`
  })
  return (
    (r.partial ? `no group matches every word of "${r.query}"; closest:\n` : '') + lines.join('\n')
  )
}

export function formatExplain(r) {
  const out = [
    `${r.group}  ${r.file}${r.doc ? `  — ${r.doc}` : ''}`,
    `  <el ${r.attributes.root}>${r.attributes.part ? `  part: <el ${r.attributes.part}>` : ''}`,
  ]
  for (const el of r.elements) {
    if (!el.decls.length) continue
    out.push(`  ${el.element}:`)
    for (const d of el.decls)
      out.push(
        `    ${d.overridden ? '~' : ' '} ${`${d.prop}: ${d.value}`.padEnd(64)} ← ${d.from} (${d.at})${d.overridden ? ', overridden' : ''}`,
      )
  }
  out.push('', r.css.trimEnd())
  if (r.contextTone) out.push('', 'Reads its tone from the nearest data-tone (warp context tone).')
  return out.join('\n')
}

/** Long class lists are how Tailwind is written, so D020 stays out of an app that chose it. */
export function usesTailwind(root) {
  const file = join(root, 'package.json')
  if (!existsSync(file)) return false
  const { dependencies, devDependencies } = JSON.parse(readFileSync(file, 'utf8'))
  return 'tailwindcss' in { ...dependencies, ...devDependencies }
}

/**
 * D020: class soup. A static `class`/`className` with more than 8 classes, or one class list (4+ classes, any order)
 * in two or more places. The fix names a group after the component and element.
 * @param {{ rel: string, text: string }[]} files
 */
export function classSoup(files) {
  const out = []
  const lists = new Map()
  const attr = /\b(class|className)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*(["'`])([^"'`$]*)\4\s*\})/g
  for (const { rel, text } of files) {
    const pos = positions(text)
    const named = new Map()
    for (const m of text.matchAll(attr)) {
      const value = m[2] ?? m[3] ?? m[5] ?? ''
      const classes = value.split(/\s+/).filter(Boolean)
      if (!classes.length) continue
      const before = text.slice(0, m.index)
      const component = [
        ...before.matchAll(/(?:function\s+([A-Z]\w*)|(?:const|let)\s+([A-Z]\w*)\s*=)/g),
      ].at(-1)
      const tag = [...before.matchAll(/<([a-z][\w-]*)\b/g)].at(-1)?.[1] ?? 'div'
      const base = component
        ? (component[1] ?? component[2]).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
        : rel
            .replace(/^.*\//, '')
            .replace(/\.\w+$/, '')
            .toLowerCase()
      const n = (named.get(base) ?? 0) + 1
      named.set(base, n)
      const name = n === 1 ? base : `${base}-${tag}`
      const at = {
        span: pos.span(m.index, m.index + m[0].length),
        offset: [m.index, m.index + m[0].length],
      }
      const site = { rel, at, name, count: classes.length }
      if (classes.length > 8)
        out.push(
          diagnostic({
            code: 'D020',
            severity: 'warning',
            file: rel,
            ...at,
            why: `<${tag}> carries ${classes.length} classes: nobody can read what it is or which variation it's in.`,
            help: groupHelp(name),
          }),
        )
      if (classes.length >= 4) {
        const key = [...classes].sort().join(' ')
        lists.set(key, [...(lists.get(key) ?? []), site])
      }
    }
  }
  for (const sites of lists.values()) {
    if (sites.length < 2) continue
    for (const s of sites.slice(1)) {
      const first = sites[0]
      out.push(
        diagnostic({
          code: 'D020',
          severity: 'warning',
          file: s.rel,
          ...s.at,
          why: `The same ${s.count} classes are written in ${sites.length} places (first at ${first.rel}:${first.at.span[0]}): one look, copied by hand.`,
          help: groupHelp(first.name),
          related: sites.filter((x) => x !== s).map((x) => ({ file: x.rel, span: x.at.span })),
        }),
      )
    }
  }
  return out
}

const groupHelp = (name) =>
  `Extract a group: \`export const ${name.replace(/-(\w)/g, (_, c) => c.toUpperCase())} = group('${name}', { base: { … } })\` and spread it (\`{...${name.replace(/-(\w)/g, (_, c) => c.toUpperCase())}()}\`). \`weft style find\` first: one may already fit.`

/** Matrix diagnostics (D021–D025) as `weft check` diagnostics, located on the group or the site. */
export function matrixDiagnostics(root, matrix) {
  const texts = new Map()
  const text = (file) => {
    if (!texts.has(file))
      texts.set(file, existsSync(join(root, file)) ? readFileSync(join(root, file), 'utf8') : '')
    return texts.get(file)
  }
  return matrix.diagnostics.map((d) => {
    const lines = text(d.file).split('\n')
    const line = Math.max(1, Math.min(d.line, lines.length))
    const col = (lines[line - 1]?.search(/\S/) ?? 0) + 1
    const loc = d.line
      ? { span: [line, col, line, (lines[line - 1]?.length ?? 0) + 1] }
      : locate(text(d.file), d.group)
    return diagnostic({
      code: d.code,
      severity: d.severity,
      file: d.file,
      ...loc,
      why: d.message,
      help: d.help,
    })
  })
}
