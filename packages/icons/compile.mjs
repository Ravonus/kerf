// The build's view of icons: walk an app's sources, follow every name to the literals it can be, and ship only those.
// Names go through variables, conditionals, static lists and maps, imports and props handed down through components.
// A name it can't follow is legal: that use gets the pack, lazily. An unknown literal is an error. No Rust: the pass is
// a parse and a walk, so it runs the same in `vite build` and `weft check`.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve as path } from 'node:path'
import { parseAst } from 'vite'

export const STOPS = ['quiet', 'balanced', 'vivid']
export const DEFAULT_STOP = 'balanced'
const SKIP = new Set(['node_modules', 'dist', '.weft', '.git', 'target', 'coverage'])
const CODE = /\.[cm]?[jt]sx?$/
const WRAPPERS = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'ParenthesizedExpression', 'TSTypeAssertion'])
const ITERATORS = new Set(['map', 'flatMap', 'filter', 'forEach', 'find', 'some', 'every', 'sort', 'toSorted'])
const ICON_SOURCES = new Set(['@weft/icons/all', '@weft/warp'])

const title = name => name.replace(/(^|-)(.)/g, (_, __, c) => c.toUpperCase())
export const pascal = (name, variant = '') => `${title(name)}Icon${variant ? variant[0].toUpperCase() + variant.slice(1) : ''}`
export const VARIANTS = ['hollow', 'solid', 'dither']
/** Which variants an element asks for: '' is the plain icon. A flag it can't read may be either. */
function variants(element) {
  const out = new Set(), flags = element.attributes.filter(a => a.type === 'JSXAttribute' && VARIANTS.includes(a.name.name))
  for (const a of flags) {
    const v = a.value?.type === 'JSXExpressionContainer' ? unwrap(a.value.expression) : null
    if (!a.value || v?.value === true) return { set: new Set([a.name.name]), fixed: flags.length === 1 }
    if (v?.value === false) continue
    out.add(a.name.name); out.add('')
  }
  if (!out.size) out.add('')
  return { set: out, fixed: out.size === 1 }
}

const line = (code, at) => { const before = code.slice(0, at).split('\n'); return { line: before.length, column: before.at(-1).length + 1 } }

function distance(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const next = [i]
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    row = next
  }
  return row[b.length]
}
export const closest = (name, names) => names.reduce((best, n) => { const d = distance(name, n) - (n.startsWith(name) ? 1 : 0); return d < best.d ? { n, d } : best }, { n: null, d: Infinity }).n

function sources(root) {
  const out = []
  const walk = dir => {
    for (const entry of readdirSync(dir)) {
      if (SKIP.has(entry) || entry.startsWith('.')) continue
      const p = join(dir, entry)
      if (statSync(p).isDirectory()) { if (entry !== 'test' && entry !== 'tests' && entry !== '__tests__') walk(p) }
      else if (CODE.test(entry) && !/\.(test|spec|d)\./.test(entry) && !/\.config\./.test(entry)) out.push(p)
      else if (extname(entry) === '.html') out.push(p)
    }
  }
  walk(root)
  return out
}

function moduleFile(from, source) {
  const base = path(dirname(from), source)
  for (const c of [base, ...['.tsx', '.ts', '.jsx', '.js', '.mjs'].map(e => base + e), ...['tsx', 'ts', 'jsx', 'js'].map(e => join(base, `index.${e}`)), base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx')])
    if (existsSync(c) && statSync(c).isFile()) return c
  return null
}

function parse(file, code) {
  try { return parseAst(code, { lang: /\.tsx$/.test(file) ? 'tsx' : /\.ts$/.test(file) ? 'ts' : 'jsx' }) } catch { return null }
}

/** One source: its imports, what its names are bound to, and every place an icon name, a stop or a pack is used. */
function read(file, code) {
  const unit = { file, code, imports: new Map(), bindings: new Map(), exports: new Map(), uses: [], sites: [], stops: [], related: [], warp: false }
  if (extname(file) === '.html') {
    for (const m of code.matchAll(/data-expression=["']?([a-z]+)/g)) unit.stops.push({ value: m[1] })
    return unit
  }
  for (const m of code.matchAll(/setAttribute\(\s*['"]data-expression['"]\s*,\s*(?:['"]([a-z]+)['"])?/g)) unit.stops.push(m[1] ? { value: m[1] } : { dynamic: true, at: m.index })
  if (/dataset\.expression\s*=/.test(code)) unit.stops.push({ dynamic: true, at: code.search(/dataset\.expression\s*=/) })
  const ast = parse(file, code)
  if (!ast) return unit
  unit.ast = ast
  const bind = (name, binding) => { if (!unit.bindings.has(name)) unit.bindings.set(name, []); unit.bindings.get(name).push(binding) }
  const pattern = (id, make) => {
    if (id?.type === 'Identifier') bind(id.name, make(null))
    else if (id?.type === 'AssignmentPattern') pattern(id.left, make)
    else if (id?.type === 'ObjectPattern') for (const p of id.properties) {
      const key = p.key?.name ?? p.key?.value
      if (key !== undefined) pattern(p.value, inner => make(inner ? [key, ...inner] : [key]))
    }
  }
  const component = (name, params) => {
    if (!name || !/^[A-Z]/.test(name)) return
    const first = params?.[0] ?? params?.items?.[0]
    if (first?.type === 'Identifier') bind(first.name, { kind: 'props', comp: name })
    else if (first) pattern(first, keys => ({ kind: 'prop', comp: name, key: keys?.[0] }))
  }
  const visit = (node, parent) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) { for (const n of node) visit(n, parent); return }
    if (typeof node.type !== 'string') return
    switch (node.type) {
      case 'ImportDeclaration': {
        const source = node.source.value
        if (source === '@weft/warp' || source.startsWith('@weft/warp/')) unit.warp = true
        const target = source.startsWith('.') ? moduleFile(file, source) : null
        if (target) unit.related.push(target)
        for (const s of node.specifiers ?? []) {
          const imported = s.type === 'ImportNamespaceSpecifier' ? '*' : s.type === 'ImportDefaultSpecifier' ? 'default' : s.imported.name ?? s.imported.value
          unit.imports.set(s.local.name, { source, imported, target })
        }
        return
      }
      case 'ExportNamedDeclaration':
        if (node.source && node.source.value.startsWith('.')) { const t = moduleFile(file, node.source.value); if (t) { unit.related.push(t); for (const s of node.specifiers ?? []) unit.exports.set(s.exported.name, { reexport: t, name: s.local.name ?? s.local.value }) } }
        break
      case 'ExportAllDeclaration':
        if (node.source.value.startsWith('.')) { const t = moduleFile(file, node.source.value); if (t) { unit.related.push(t); (unit.stars ??= []).push(t) } }
        break
      case 'VariableDeclarator':
        if (node.init) {
          pattern(node.id, keys => ({ kind: 'value', expr: node.init, keys }))
          const fn = unwrap(node.init)
          if (node.id.type === 'Identifier' && /Function/.test(fn.type)) component(node.id.name, fn.params)
        }
        break
      case 'FunctionDeclaration':
        component(node.id?.name, node.params)
        break
      case 'CallExpression': {
        const callee = node.callee
        if (callee.type === 'MemberExpression' && !callee.computed && ITERATORS.has(callee.property.name)) {
          const fn = node.arguments[0] && unwrap(node.arguments[0])
          if (fn && /Function/.test(fn.type)) pattern(fn.params?.[0] ?? fn.params?.items?.[0], keys => ({ kind: 'each', of: callee.object, keys }))
        }
        break
      }
      case 'JSXOpeningElement': {
        const comp = node.name.type === 'JSXIdentifier' ? node.name.name : node.name.type === 'JSXMemberExpression' ? `${node.name.object.name}.${node.name.property.name}` : null
        if (!comp) break
        for (const attr of node.attributes) {
          if (attr.type !== 'JSXAttribute' || attr.name.type !== 'JSXIdentifier') continue
          const value = attr.value?.type === 'JSXExpressionContainer' ? attr.value.expression : attr.value
          if (attr.name.name === 'data-expression' && value) unit.stops.push({ expr: value, at: attr.start })
          if (value && /^[A-Z]/.test(comp)) unit.uses.push({ comp, prop: attr.name.name, expr: value, at: attr.start, end: attr.end, element: node })
        }
        break
      }
      case 'Property':
      case 'ObjectProperty':
        if (!node.computed && (node.key.name ?? node.key.value) === 'icon' && !node.method) unit.sites.push({ soft: true, expr: node.value, at: node.start })
        break
    }
    for (const k of Object.keys(node)) { if (k !== 'type' && k !== 'start' && k !== 'end') visit(node[k], node) }
  }
  visit(ast.body, null)
  return unit
}

const unwrap = node => { while (node && WRAPPERS.has(node.type)) node = node.expression; return node }

/** Everything a build needs to know: the names, the stops, and where either escaped. */
export function analyze(root, { catalog }) {
  const units = new Map()
  const queue = sources(root)
  while (queue.length) {
    const file = queue.pop()
    if (units.has(file)) continue
    let code
    try { code = readFileSync(file, 'utf8') } catch { continue }
    const unit = read(file, code)
    units.set(file, unit)
    queue.push(...unit.related)
  }
  const usesOf = new Map()
  for (const u of units.values()) for (const use of u.uses) {
    const key = `${use.comp}.${use.prop}`
    if (!usesOf.has(key)) usesOf.set(key, [])
    usesOf.get(key).push({ unit: u, use })
  }

  const empty = () => ({ values: new Set(), shapes: [], dynamic: null })
  const merge = (into, r) => { for (const v of r.values) into.values.add(v); into.shapes.push(...r.shapes); into.dynamic ??= r.dynamic; return into }
  const text = (unit, n) => unit.code.slice(n.start, n.end).slice(0, 60)

  function exported(file, name, seen) {
    const u = units.get(file)
    if (!u) return { ...empty(), dynamic: `export ${name}` }
    const re = u.exports.get(name)
    if (re?.reexport) return exported(re.reexport, re.name, seen)
    if (u.bindings.has(name)) return identifier(u, name, seen)
    for (const star of u.stars ?? []) { const r = exported(star, name, seen); if (!r.dynamic) return r }
    return { ...empty(), dynamic: `export ${name}` }
  }

  function identifier(unit, name, seen) {
    if (name === 'undefined') return empty()
    const id = `${unit.file}#${name}`
    if (seen.has(id)) return empty()
    seen.add(id)
    const imp = unit.imports.get(name)
    if (imp) {
      if (imp.source === '@weft/icons' || imp.source.startsWith('@weft/icons/')) return empty()
      if (imp.target && imp.imported !== '*') return exported(imp.target, imp.imported, seen)
      return { ...empty(), dynamic: name }
    }
    const list = unit.bindings.get(name)
    if (!list) return { ...empty(), dynamic: name }
    const out = empty()
    for (const b of list) merge(out, binding(unit, b, seen))
    seen.delete(id)
    return out
  }

  function pick(unit, from, keys, seen) {
    let cur = from
    for (const key of keys ?? []) {
      const next = empty(); next.dynamic = cur.dynamic
      for (const { shape, unit: u } of cur.shapes) merge(next, member(u, shape, key, seen))
      cur = next
    }
    return cur
  }

  function binding(unit, b, seen) {
    if (b.kind === 'value') return pick(unit, expression(unit, b.expr, seen), b.keys, seen)
    if (b.kind === 'each') {
      const list = expression(unit, b.of, seen), items = empty()
      items.dynamic = list.dynamic
      for (const { shape, unit: u } of list.shapes) if (shape.type === 'ArrayExpression') for (const el of shape.elements) if (el) merge(items, expression(u, el, seen))
      return pick(unit, items, b.keys, seen)
    }
    if (b.kind === 'prop') return b.key ? forwarded(b.comp, b.key, seen) : { ...empty(), dynamic: `${b.comp} props` }
    return { ...empty(), dynamic: `${b.comp} props` }
  }

  function forwarded(comp, prop, seen) {
    const out = empty()
    for (const { unit, use } of usesOf.get(`${comp}.${prop}`) ?? []) merge(out, expression(unit, use.expr, seen))
    return out
  }

  function member(unit, shape, key, seen) {
    const out = empty()
    if (shape.type === 'ObjectExpression') {
      for (const p of shape.properties) {
        if (p.type === 'SpreadElement') { const s = expression(unit, p.argument, seen); for (const x of s.shapes) merge(out, member(x.unit, x.shape, key, seen)); out.dynamic ??= s.dynamic; continue }
        const k = p.key?.name ?? p.key?.value
        if (key === null || k === key) merge(out, expression(unit, p.value, seen))
      }
    } else if (shape.type === 'ArrayExpression') for (const el of shape.elements) if (el) merge(out, expression(unit, el, seen))
    return out
  }

  function expression(unit, raw, seen = new Set()) {
    const node = unwrap(raw)
    if (!node) return empty()
    switch (node.type) {
      case 'Literal':
      case 'StringLiteral':
        return typeof node.value === 'string' ? { ...empty(), values: new Set([node.value]) } : empty()
      case 'TemplateLiteral':
        return node.expressions.length ? { ...empty(), dynamic: text(unit, node) } : { ...empty(), values: new Set([node.quasis[0].value.cooked]) }
      case 'ConditionalExpression':
        return merge(expression(unit, node.consequent, seen), expression(unit, node.alternate, seen))
      case 'LogicalExpression':
        return merge(expression(unit, node.left, seen), expression(unit, node.right, seen))
      case 'ArrayExpression':
      case 'ObjectExpression':
        return { ...empty(), shapes: [{ shape: node, unit }] }
      case 'Identifier':
        return identifier(unit, node.name, seen)
      case 'ArrowFunctionExpression':
      case 'FunctionExpression':
      case 'JSXElement':
      case 'JSXFragment':
        return empty()
      case 'MemberExpression': {
        const object = unwrap(node.object)
        const key = node.computed ? (unwrap(node.property)?.value ?? null) : node.property.name
        if (object.type === 'Identifier') {
          const props = unit.bindings.get(object.name)?.find(b => b.kind === 'props')
          if (props && key) return forwarded(props.comp, key, seen)
          const imp = unit.imports.get(object.name)
          if (imp?.imported === '*' && imp.target && key) return exported(imp.target, key, seen)
        }
        const base = expression(unit, object, seen), out = empty()
        out.dynamic = base.dynamic
        for (const { shape, unit: u } of base.shapes) merge(out, member(u, shape, key, seen))
        return out
      }
      case 'CallExpression': { // a list method hands back the list, or an item of it
        const c = node.callee
        if (c.type === 'MemberExpression' && !c.computed && ['filter', 'sort', 'toSorted', 'slice', 'reverse', 'concat'].includes(c.property.name)) return expression(unit, c.object, seen)
        if (c.type === 'MemberExpression' && !c.computed && c.property.name === 'find') {
          const base = expression(unit, c.object, seen), out = empty()
          out.dynamic = base.dynamic
          for (const { shape, unit: u } of base.shapes) merge(out, member(u, shape, null, seen))
          return out
        }
        return { ...empty(), dynamic: text(unit, node) }
      }
      default:
        return { ...empty(), dynamic: text(unit, node) }
    }
  }

  const names = new Set(), unknown = [], dynamic = [], stops = new Set([DEFAULT_STOP]), stopsDynamic = []
  const known = new Set(catalog)
  const where = (unit, at) => ({ file: relative(root, unit.file), abs: unit.file, ...line(unit.code, at) })
  const site = (unit, expr, at, soft, element) => {
    const r = expression(unit, expr)
    const kinds = element ? variants(element).set : new Set([''])
    for (const v of r.values) {
      if (known.has(v)) for (const k of kinds) names.add(k ? `${v}:${k}` : v)
      else if (!soft) unknown.push({ name: v, suggest: closest(v, catalog), ...where(unit, unwrap(expr).start ?? at) })
    }
    if (r.dynamic) dynamic.push({ why: r.dynamic, ...where(unit, at) })
  }
  const iconLocal = (unit, comp) => { const imp = unit.imports.get(comp); return imp && imp.imported === 'Icon' && ICON_SOURCES.has(imp.source) }
  const warpLocal = (unit, comp) => { const imp = unit.imports.get(comp.split('.')[0]); return imp && (imp.source === '@weft/warp' || imp.source.startsWith('@weft/warp/')) }
  for (const unit of units.values()) {
    for (const use of unit.uses) {
      if (use.prop === 'name' && iconLocal(unit, use.comp)) site(unit, use.expr, use.at, false, use.element)
      else if (use.prop === 'icon' && warpLocal(unit, use.comp)) site(unit, use.expr, use.at, false)
      if (use.prop === 'tier') { for (const v of expression(unit, use.expr).values) if (STOPS.includes(v)) stops.add(v) }
    }
    if (unit.warp) for (const s of unit.sites) site(unit, s.expr, s.at, true)
    for (const s of unit.stops) {
      if (s.value) { if (STOPS.includes(s.value)) stops.add(s.value); continue }
      if (s.dynamic) { stopsDynamic.push(where(unit, s.at)); continue }
      const r = expression(unit, s.expr)
      for (const v of r.values) if (STOPS.includes(v)) stops.add(v)
      if (r.dynamic) stopsDynamic.push({ why: r.dynamic, ...where(unit, s.at) })
    }
  }
  return { names, unknown, dynamic, stops: stopsDynamic.length ? new Set(STOPS) : stops, stopsDynamic, files: units.size }
}

/** The module warp's name lookup becomes in a build: these names and no others, and the pack only if a name escaped. */
export function namesModule(names, { lazy = false } = {}) {
  const list = [...names].sort()
  const id = key => pascal(...key.split(':'))
  const imports = list.length ? `import { ${list.map(id).join(', ')} } from '@weft/icons'\n` : ''
  const table = `const names = { ${list.map(n => `${JSON.stringify(n)}: ${id(n)}`).join(', ')} }\nconst key = (name, variant) => (variant ? name + ':' + variant : name)\n`
  if (lazy) return `${imports}import { late } from '@weft/icons/late'\n${table}const pack = () => import('@weft/icons/all').then(m => m.lookup)\nexport const resolve = (name, variant) => names[key(name, variant)] ?? late(name, variant, pack)\n`
  return `${imports}${table}export const resolve = (name, variant) => names[key(name, variant)]\n`
}

const VISIBLE = { quiet: 'oq', balanced: 'ob', vivid: 'v' }
/** Drop the drawings no shipped stop can show. With one stop left there is nothing to switch, so the switch goes too. */
export function trimTiers(source, stops) {
  // a build imports the pack as a namespace (rewrite), and this default would keep every icon alive
  const code = source.replace("import * as self from './all'\n", '').replace('export default self\n', '')
  if (stops.size === 3) return code
  const keep = [...stops].map(s => VISIBLE[s]).join('')
  const out = code.replace(/<path data-t="([oqbv])"[^>]*?\/>/g, (m, t) => (keep.includes(t) ? m : ''))
  return stops.size === 1 ? out.replaceAll(/ data-t="[oqbv]"/g, '').replace("import '../tiers.css'\n", '') : out
}

/** `<Icon name="check">` becomes `<IconCheck>`, the same output a named import gives. */
export function rewrite(code, file, catalog) {
  if (!/@weft\/(icons\/all|warp)/.test(code) || !/<Icon\b/.test(code)) return null
  const unit = read(file, code)
  if (!unit.ast) return null
  const local = [...unit.imports].find(([, i]) => i.imported === 'Icon' && ICON_SOURCES.has(i.source))?.[0]
  if (!local) return null
  const edits = [], added = new Set()
  for (const use of unit.uses) {
    if (use.comp !== local || use.prop !== 'name') continue
    const v = unwrap(use.expr)
    if ((v.type !== 'Literal' && v.type !== 'StringLiteral') || typeof v.value !== 'string') continue
    if (catalog && !catalog.includes(v.value)) throw Object.assign(new Error(unknownMessage(v.value, catalog)), { loc: { file, ...line(code, v.start) } })
    if (!use.element.selfClosing) continue
    const wanted = variants(use.element)
    if (!wanted.fixed) continue
    const name = pascal(v.value, [...wanted.set][0])
    added.add(name)
    edits.push({ start: use.element.start, end: use.element.name.end, text: `<${name}` }, { start: use.at, end: use.end, text: '' })
    for (const a of use.element.attributes) if (a.type === 'JSXAttribute' && VARIANTS.includes(a.name.name)) edits.push({ start: a.start, end: a.end, text: '' })
  }
  if (!edits.length) return null
  let out = code
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end)
  return `import { ${[...added].join(', ')} } from '@weft/icons'\n${out}`
}

export const unknownMessage = (name, catalog) => `I001 no icon '${name}', did you mean '${closest(name, catalog)}'?`

export const list = () => [...new Set([...readFileSync(new URL('./src/gen/names.ts', import.meta.url), 'utf8').split('\n')[1].matchAll(/"([a-z0-9-]+)"/g)].map(m => m[1]))]

/** The vite side, loaded by weft/vite when @weft/icons is in the build. */
export function pass({ root, command, tier }) {
  const build = command === 'build'
  const catalog = list()
  const result = build ? analyze(root, { catalog }) : null
  const lazy = !!result?.dynamic.length
  const stops = tier && tier !== 'all' ? new Set([tier]) : result && !tier ? result.stops : new Set(STOPS)
  return { catalog, result, lazy, stops, module: () => namesModule(result.names, { lazy }) }
}
