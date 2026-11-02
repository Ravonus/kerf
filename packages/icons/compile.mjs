// The build's view of icons: walk an app's sources, follow every name to the literals it can be, and ship only those.
// Names go through variables, conditionals, static lists and maps, imports and props handed down through components.
// A name it can't follow is legal: that use gets the pack, lazily. An unknown literal is an error. No Rust: the pass is
// a parse and a walk, so it runs the same in `vite build` and `weft check`.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve as path } from 'node:path'
import { brotliCompressSync, constants } from 'node:zlib'
import { parseAst } from 'vite'

export const STOPS = ['quiet', 'balanced', 'vivid']
export const DEFAULT_STOP = 'balanced'
const SKIP = new Set(['node_modules', 'dist', '.weft', '.git', 'target', 'coverage'])
const CODE = /\.[cm]?[jt]sx?$/
const WRAPPERS = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'ParenthesizedExpression', 'TSTypeAssertion'])
const ITERATORS = new Set(['map', 'flatMap', 'filter', 'forEach', 'find', 'some', 'every', 'sort', 'toSorted'])
const ICON_SOURCES = new Set(['@weft-js/warp-icons/all', '@weft-js/warp-icons/icon', '@weft-js/warp'])

const title = name => name.replace(/(^|-)(.)/g, (_, __, c) => c.toUpperCase())
export const pascal = (name, variant = '') => `${title(name)}Icon${variant ? variant[0].toUpperCase() + variant.slice(1) : ''}`
export const VARIANTS = ['solid']
/** Which variants an element asks for: '' is hollow, the default. A flag it can't read may be either. */
function variants(element) {
  const out = new Set(), flags = element.attributes.filter(a => a.type === 'JSXAttribute' && (VARIANTS.includes(a.name.name) || a.name.name === 'action'))
  for (const a of flags) {
    const v = a.value?.type === 'JSXExpressionContainer' ? unwrap(a.value.expression) : null
    if (!a.value || v?.value === true || typeof a.value.value === 'string' || (typeof v?.value === 'string' && v.value)) return { set: new Set([a.name.name]), fixed: flags.length === 1 }
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
  const unit = { file, code, imports: new Map(), bindings: new Map(), exports: new Map(), uses: [], sites: [], stops: [], related: [], members: [], idents: [], warp: false }
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
        if (source === '@weft-js/warp' || source.startsWith('@weft-js/warp/')) unit.warp = true
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
      case 'MemberExpression':
        if (node.object.type === 'Identifier') unit.members.push({ local: node.object.name, node })
        break
      case 'JSXMemberExpression':
        if (node.object.type === 'JSXIdentifier') unit.members.push({ local: node.object.name, node, jsx: true })
        break
      case 'Identifier':
      case 'JSXIdentifier':
        unit.idents.push(node)
        break
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

const isSpecifier = (unit, id) => unit.ast.body.some(n => n.type === 'ImportDeclaration' && n.specifiers?.some(s => s.local === id || s.local.start === id.start))
const packLocals = unit => [...unit.imports].filter(([, i]) => i.source === '@weft-js/warp-icons' && (i.imported === 'default' || i.imported === '*')).map(([l]) => l)
const kebab = s => s.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`).replace(/^-/, '')
const TOOLS = new Set(['iconSet'])
/** `X`, `XHollow`, `XIcon`, `XIconSolid`: a pack member as a name and a variant. */
function member(id) {
  const [, base, variant = ''] = /^(.+?)(Hollow|Solid|Action)?$/.exec(id.replace(/Icon(?=$|Hollow$|Solid$|Action$)/, ''))
  return { name: kebab(base), variant: variant === 'Hollow' ? '' : variant.toLowerCase() }
}
function packName(id, catalog, names, missing) {
  if (TOOLS.has(id)) return
  const { name, variant } = member(id)
  if (catalog.includes(name)) names.add(variant ? `${name}:${variant}` : name)
  else missing()
}
const packIds = catalog => catalog.map(n => title(n))

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
      if (imp.source === '@weft-js/warp-icons' || imp.source.startsWith('@weft-js/warp-icons/')) return empty()
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

  const names = new Set(), unknown = [], dynamic = [], escaped = [], stops = new Set([DEFAULT_STOP]), stopsDynamic = []
  const known = new Set(catalog)
  const where = (unit, at) => ({ file: relative(root, unit.file), abs: unit.file, ...line(unit.code, at) })
  const site = (unit, expr, at, soft, element) => {
    const r = expression(unit, expr)
    const kinds = element ? variants(element).set : new Set([''])
    for (const v of r.values) {
      if (known.has(v)) for (const k of kinds) {
        if (k === 'action' && !actionList().includes(v)) unknown.push({ name: v, why: actionMessage(v).slice(5), ...where(unit, unwrap(expr).start ?? at) })
        else names.add(k ? `${v}:${k}` : v)
      }
      else if (!soft) unknown.push({ name: v, suggest: closest(v, catalog), ...where(unit, unwrap(expr).start ?? at) })
    }
    if (r.dynamic) dynamic.push({ why: r.dynamic, ...where(unit, at) })
  }
  const iconLocal = (unit, comp) => { const imp = unit.imports.get(comp); return imp && imp.imported === 'Icon' && ICON_SOURCES.has(imp.source) }
  const warpLocal = (unit, comp) => { const imp = unit.imports.get(comp.split('.')[0]); return imp && (imp.source === '@weft-js/warp' || imp.source.startsWith('@weft-js/warp/')) }
  for (const unit of units.values()) {
    for (const use of unit.uses) {
      if (use.prop === 'name' && iconLocal(unit, use.comp)) site(unit, use.expr, use.at, false, use.element)
      else if (use.prop === 'icon' && warpLocal(unit, use.comp)) {
        // a literal becomes the icon itself (`rewrite`), so it needs no entry in every page's table
        const v = literal(use.expr)
        if (v !== undefined && known.has(v)) continue
        site(unit, use.expr, use.at, false)
      }
      if (use.prop === 'tier') { for (const v of expression(unit, use.expr).values) if (STOPS.includes(v)) stops.add(v) }
    }
    if (unit.warp) for (const s of unit.sites) site(unit, s.expr, s.at, true)
    for (const local of packLocals(unit)) {
      const own = unit.members.filter(m => m.local === local), inner = new Set(own.map(m => m.node.object))
      for (const { node } of own) {
        if (node.computed) {
          const r = expression(unit, node.property)
          for (const v of r.values) packName(v, catalog, names, () => unknown.push({ name: v, suggest: closest(v, packIds(catalog)), ...where(unit, node.start) }))
          if (r.dynamic) dynamic.push({ why: r.dynamic, ...where(unit, node.start) })
        } else packName(node.property.name, catalog, names, () => unknown.push({ name: node.property.name, suggest: closest(node.property.name, packIds(catalog)), ...where(unit, node.property.start) }))
      }
      for (const id of unit.idents) if (id.name === local && !inner.has(id) && !isSpecifier(unit, id)) escaped.push({ why: `${local} is used as a value`, ...where(unit, id.start) })
    }
    for (const s of unit.stops) {
      if (s.value) { if (STOPS.includes(s.value)) stops.add(s.value); continue }
      if (s.dynamic) { stopsDynamic.push(where(unit, s.at)); continue }
      const r = expression(unit, s.expr)
      for (const v of r.values) if (STOPS.includes(v)) stops.add(v)
      if (r.dynamic) stopsDynamic.push({ why: r.dynamic, ...where(unit, s.at) })
    }
  }
  return { names, unknown, dynamic, escaped, stops: stopsDynamic.length ? new Set(STOPS) : stops, stopsDynamic, files: units.size }
}

/** The module warp's name lookup becomes in a build: these names and no others, and the pack only if a name escaped. */
export function namesModule(names, { lazy = false, source } = {}) {
  const list = [...names].sort()
  const id = key => pascal(...key.split(':'))
  const imports = list.length ? `import { ${list.map(id).join(', ')} } from '@weft-js/warp-icons'\n` : ''
  const table = `const names = { ${list.map(n => `${JSON.stringify(n)}: ${id(n)}`).join(', ')} }\nconst key = (name, variant) => (variant ? name + ':' + variant : name)\n`
  const member = `export const pack = id => { const [, b, v = ''] = /^(.+?)(Hollow|Solid|Action)?$/.exec(id.replace(/Icon(?=$|Hollow$|Solid$|Action$)/, '')); return resolve(b.replace(/[A-Z]/g, c => '-' + c.toLowerCase()).replace(/^-/, ''), v.toLowerCase()) }\n`
  if (source) return `${imports}import { remote } from '@weft-js/warp-icons/late'\n${table}const get = remote(${JSON.stringify(source)})\nexport const resolve = (name, variant) => names[key(name, variant)] ?? get(name, variant)\n${member}`
  if (lazy) return `${imports}import { late } from '@weft-js/warp-icons/late'\n${table}const load = () => import('@weft-js/warp-icons/all').then(m => m.lookup)\nexport const resolve = (name, variant) => names[key(name, variant)] ?? late(name, variant, load)\n${member}`
  return `${imports}${table}export const resolve = (name, variant) => names[key(name, variant)]\n${member}`
}

const VISIBLE = { quiet: 'oq', balanced: 'ob', vivid: 'v' }
/** Drop the drawings no shipped stop can show. With one stop left there is nothing to switch, so the switch goes too. */
export function trimTiers(source, stops) {
  // a build imports the pack as a namespace (rewrite), and this default would keep every icon alive
  const code = source
  if (stops.size === 3) return code
  const keep = [...stops].map(s => VISIBLE[s]).join('')
  const out = code.replace(/<path data-t="([oqbv])"[^>]*?\/>/g, (m, t) => (keep.includes(t) ? m : ''))
  return stops.size === 1 ? out.replaceAll(/ data-t="[oqbv]"/g, '').replace("import '../tiers.css'\n", '') : out
}

const literal = expr => {
  const v = unwrap(expr)
  return (v.type === 'Literal' || v.type === 'StringLiteral') && typeof v.value === 'string' ? v.value : undefined
}

/** `<Icon name="check">` becomes `<CheckIcon>`, the same output a named import gives, and `icon="check"` on a warp component takes `CheckIcon`. */
export function rewrite(code, file, catalog) {
  if (!/@weft-js\/(warp-icons|warp)/.test(code)) return null
  const unit = read(file, code)
  if (!unit.ast) return null
  const local = [...unit.imports].find(([, i]) => i.imported === 'Icon' && ICON_SOURCES.has(i.source))?.[0]
  const edits = [], added = new Set()
  // `Icon` alone is a small file over the names module, so this import doesn't bring the set
  for (const n of unit.ast.body) if (n.type === 'ImportDeclaration' && n.source.value === '@weft-js/warp-icons/all' && n.specifiers.length === 1 && n.specifiers[0].imported?.name === 'Icon') edits.push({ start: n.source.start, end: n.source.end, text: "'@weft-js/warp-icons/icon'" })
  // the pack: a default import is the namespace, so a static member is an ordinary named import to the bundler
  let lookups = false
  for (const pack of packLocals(unit)) {
    for (const n of unit.ast.body) if (n.type === 'ImportDeclaration' && n.source.value === '@weft-js/warp-icons') for (const s of n.specifiers) if (s.local.name === pack && s.type === 'ImportDefaultSpecifier') edits.push({ start: s.start, end: s.end, text: `* as ${pack}` })
    for (const { local: l, node } of unit.members) {
      if (l !== pack) continue
      if (!node.computed) { if (catalog) packName(node.property.name, catalog, new Set(), () => { throw Object.assign(new Error(unknownMessage(node.property.name, packIds(catalog))), { loc: { file, ...line(code, node.property.start) } }) }); continue }
      edits.push({ start: node.start, end: node.property.start, text: '__icon(' }, { start: node.property.end, end: node.end, text: ')' })
      lookups = true
    }
  }
  for (const use of unit.uses) {
    if (use.prop === 'icon') {
      const v = literal(use.expr), imp = unit.imports.get(use.comp.split('.')[0])
      if (v === undefined || !imp || !(imp.source === '@weft-js/warp' || imp.source.startsWith('@weft-js/warp/'))) continue
      if (catalog && !catalog.includes(v)) throw Object.assign(new Error(unknownMessage(v, catalog)), { loc: { file, ...line(code, unwrap(use.expr).start) } })
      const name = pascal(v)
      added.add(name)
      edits.push({ start: use.at, end: use.end, text: `icon={${name}}` })
      continue
    }
    if (!local || use.comp !== local || use.prop !== 'name') continue
    const v = unwrap(use.expr)
    if ((v.type !== 'Literal' && v.type !== 'StringLiteral') || typeof v.value !== 'string') continue
    if (catalog && !catalog.includes(v.value)) throw Object.assign(new Error(unknownMessage(v.value, catalog)), { loc: { file, ...line(code, v.start) } })
    if (!use.element.selfClosing) continue
    const wanted = variants(use.element)
    if (!wanted.fixed) continue
    if (wanted.set.has('action') && !actionList().includes(v.value)) throw Object.assign(new Error(actionMessage(v.value)), { loc: { file, ...line(code, v.start) } })
    const name = pascal(v.value, [...wanted.set][0])
    added.add(name)
    edits.push({ start: use.element.start, end: use.element.name.end, text: `<${name}` }, { start: use.at, end: use.end, text: '' })
    for (const a of use.element.attributes) if (a.type === 'JSXAttribute' && VARIANTS.includes(a.name.name)) edits.push({ start: a.start, end: a.end, text: '' })
  }
  if (!edits.length) return null
  let out = code
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end)
  const head = (added.size ? `import { ${[...added].join(', ')} } from '@weft-js/warp-icons'\n` : '') + (lookups ? "import { pack as __icon } from '@weft-js/warp-icons/names'\n" : '')
  return head + out
}

export const actionMessage = name => `I001 no action for icon '${name}', did you mean '${closest(name, actionList())}'? The action icons are ${actionList().join(', ')}.`
export const unknownMessage = (name, catalog) => `I001 no icon '${name}', did you mean '${closest(name, catalog)}'?`

export const actionList = () => [...readFileSync(new URL('./src/gen/names.ts', import.meta.url), 'utf8').match(/const actions = (\[.*?\])/)[1].matchAll(/"([a-z0-9-]+)"/g)].map(m => m[1])
export const list = () => [...new Set([...readFileSync(new URL('./src/gen/names.ts', import.meta.url), 'utf8').split('\n')[1].matchAll(/"([a-z0-9-]+)"/g)].map(m => m[1]))]

/** The vite side, loaded by @weft-js/core/vite when @weft-js/warp-icons is in the build. */
export function pass({ root, command, tier, source }) {
  const build = command === 'build'
  const catalog = list()
  const result = build ? analyze(root, { catalog }) : null
  const lazy = !!result?.dynamic.length
  const stops = tier && tier !== 'all' ? new Set([tier]) : result && !tier ? result.stops : new Set(STOPS)
  return { catalog, result, lazy, stops, module: () => namesModule(result.names, { lazy, source }) }
}

/** What the pack costs if a page takes it: every icon in one tier, brotli. */
export function packCost() {
  const code = readFileSync(new URL('./src/gen/all.tsx', import.meta.url), 'utf8')
  return brotliCompressSync(Buffer.from(code), { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }).length
}

/** `weft check`'s view: the same walk a build does, as findings. */
export function findings(root) {
  const catalog = list(), r = analyze(root, { catalog })
  const kb = `${(packCost() / 1024).toFixed(0)} KB`
  return [
    ...r.unknown.map(u => ({ code: 'I001', file: u.file, line: u.line, column: u.column, why: u.why ?? `no icon '${u.name}', did you mean '${u.suggest}'?` })),
    ...r.dynamic.map(d => ({ code: 'I002', file: d.file, line: d.line, column: d.column, why: `\`${d.why}\` isn't known until runtime, so this use loads the icon pack lazily (about ${kb} br, only on pages that reach it).` })),
    ...r.escaped.map(d => ({ code: 'I003', file: d.file, line: d.line, column: d.column, why: `${d.why}, so every icon ships with the page (about ${kb} br).` })),
  ]
}

/** Every icon and variant as a static .svg, for a CDN or bucket. Writes files; nothing is uploaded. */
export async function publish(dir) {
  const { load } = await import('./scripts/build.mjs')
  const { forms } = await import('./scripts/forms.mjs')
  const icons = await load()
  mkdirSync(dir, { recursive: true })
  const svg = html => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${html}</svg>\n`
  let files = 0
  for (const [name, entry] of Object.entries(icons)) {
    const f = forms(name, entry)
    const all = { '': f.hollow.line + f.hollow.pixels, '.solid': f.solid.line + f.solid.pixels }
    for (const [suffix, html] of Object.entries(all)) { writeFileSync(join(dir, `${name}${suffix}.svg`), svg(html)); files++ }
  }
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ icons: Object.keys(icons), variants: ['', 'solid'] }) + '\n')
  return { dir, files, icons: Object.keys(icons).length }
}
