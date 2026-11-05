import { existsSync, statSync } from 'node:fs'
import { dirname, extname, join, resolve as path } from 'node:path'
import { parseAst } from 'vite'
import { unwrap } from './compile-unwrap.mjs'

const ITERATORS = new Set([
  'map',
  'flatMap',
  'filter',
  'forEach',
  'find',
  'some',
  'every',
  'sort',
  'toSorted',
])
function moduleFile(from, source) {
  const base = path(dirname(from), source)
  for (const c of [
    base,
    ...['.tsx', '.ts', '.jsx', '.js', '.mjs'].map((e) => base + e),
    ...['tsx', 'ts', 'jsx', 'js'].map((e) => join(base, `index.${e}`)),
    base.replace(/\.js$/, '.ts'),
    base.replace(/\.js$/, '.tsx'),
  ])
    if (existsSync(c) && statSync(c).isFile()) return c
  return null
}

function parse(file, code) {
  try {
    return parseAst(code, {
      lang: file.endsWith('.tsx') ? 'tsx' : file.endsWith('.ts') ? 'ts' : 'jsx',
    })
  } catch {
    return null
  }
}

/** One source: its imports, what its names are bound to, and every place an icon name, a stop or a pack is used. */
export function read(file, code) {
  const unit = {
    file,
    code,
    imports: new Map(),
    bindings: new Map(),
    exports: new Map(),
    uses: [],
    sites: [],
    stops: [],
    related: [],
    members: [],
    idents: [],
    warp: false,
  }
  if (extname(file) === '.html') {
    for (const m of code.matchAll(/data-expression=["']?([a-z]+)/g))
      unit.stops.push({ value: m[1] })
    return unit
  }
  for (const m of code.matchAll(
    /setAttribute\(\s*['"]data-expression['"]\s*,\s*(?:['"]([a-z]+)['"])?/g,
  ))
    unit.stops.push(m[1] ? { value: m[1] } : { dynamic: true, at: m.index })
  if (/dataset\.expression\s*=/.test(code))
    unit.stops.push({ dynamic: true, at: code.search(/dataset\.expression\s*=/) })
  const ast = parse(file, code)
  if (!ast) return unit
  unit.ast = ast
  visitUnit(unit, ast, file)
  return unit
}

function visitUnit(unit, ast, file) {
  const bind = (name, binding) => {
    if (!unit.bindings.has(name)) unit.bindings.set(name, [])
    unit.bindings.get(name).push(binding)
  }
  const pattern = (id, make) => {
    if (id?.type === 'Identifier') bind(id.name, make(null))
    else if (id?.type === 'AssignmentPattern') pattern(id.left, make)
    else if (id?.type === 'ObjectPattern')
      for (const p of id.properties) {
        const key = p.key?.name ?? p.key?.value
        if (key !== undefined) pattern(p.value, (inner) => make(inner ? [key, ...inner] : [key]))
      }
  }
  const component = (name, params) => {
    if (!name || !/^[A-Z]/.test(name)) return
    const first = params?.[0] ?? params?.items?.[0]
    if (first?.type === 'Identifier') bind(first.name, { kind: 'props', comp: name })
    else if (first) pattern(first, (keys) => ({ kind: 'prop', comp: name, key: keys?.[0] }))
  }
  const visit = (node) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const n of node) visit(n)
      return
    }
    if (typeof node.type !== 'string') return
    if (declarations(node, unit, file, pattern, component)) return
    uses(node, unit)
    for (const k of Object.keys(node)) {
      if (k !== 'type' && k !== 'start' && k !== 'end') visit(node[k])
    }
  }
  visit(ast.body)
}

function declarations(node, unit, file, pattern, component) {
  switch (node.type) {
    case 'ImportDeclaration': {
      const source = node.source.value
      if (source === '@weft-js/warp' || source.startsWith('@weft-js/warp/')) unit.warp = true
      const target = source.startsWith('.') ? moduleFile(file, source) : null
      if (target) unit.related.push(target)
      for (const s of node.specifiers ?? []) {
        const imported =
          s.type === 'ImportNamespaceSpecifier'
            ? '*'
            : s.type === 'ImportDefaultSpecifier'
              ? 'default'
              : (s.imported.name ?? s.imported.value)
        unit.imports.set(s.local.name, { source, imported, target })
      }
      return true
    }
    case 'ExportNamedDeclaration':
      if (node.source && node.source.value.startsWith('.')) {
        const t = moduleFile(file, node.source.value)
        if (t) {
          unit.related.push(t)
          for (const s of node.specifiers ?? [])
            unit.exports.set(s.exported.name, {
              reexport: t,
              name: s.local.name ?? s.local.value,
            })
        }
      }
      break
    case 'ExportAllDeclaration':
      if (node.source.value.startsWith('.')) {
        const t = moduleFile(file, node.source.value)
        if (t) {
          unit.related.push(t)
          ;(unit.stars ??= []).push(t)
        }
      }
      break
    case 'VariableDeclarator':
      if (node.init) {
        pattern(node.id, (keys) => ({ kind: 'value', expr: node.init, keys }))
        const fn = unwrap(node.init)
        if (node.id.type === 'Identifier' && /Function/.test(fn.type))
          component(node.id.name, fn.params)
      }
      break
    case 'FunctionDeclaration':
      component(node.id?.name, node.params)
      break
    case 'CallExpression': {
      const callee = node.callee
      if (
        callee.type === 'MemberExpression' &&
        !callee.computed &&
        ITERATORS.has(callee.property.name)
      ) {
        const fn = node.arguments[0] && unwrap(node.arguments[0])
        if (fn && /Function/.test(fn.type))
          pattern(fn.params?.[0] ?? fn.params?.items?.[0], (keys) => ({
            kind: 'each',
            of: callee.object,
            keys,
          }))
      }
      break
    }
  }
  return false
}

function uses(node, unit) {
  switch (node.type) {
    case 'MemberExpression':
      if (node.object.type === 'Identifier') unit.members.push({ local: node.object.name, node })
      break
    case 'JSXMemberExpression':
      if (node.object.type === 'JSXIdentifier')
        unit.members.push({ local: node.object.name, node, jsx: true })
      break
    case 'Identifier':
    case 'JSXIdentifier':
      unit.idents.push(node)
      break
    case 'JSXOpeningElement': {
      const comp =
        node.name.type === 'JSXIdentifier'
          ? node.name.name
          : node.name.type === 'JSXMemberExpression'
            ? `${node.name.object.name}.${node.name.property.name}`
            : null
      if (!comp) break
      for (const attr of node.attributes) {
        if (attr.type !== 'JSXAttribute' || attr.name.type !== 'JSXIdentifier') continue
        const value =
          attr.value?.type === 'JSXExpressionContainer' ? attr.value.expression : attr.value
        if (attr.name.name === 'data-expression' && value)
          unit.stops.push({ expr: value, at: attr.start })
        if (value && /^[A-Z]/.test(comp))
          unit.uses.push({
            comp,
            prop: attr.name.name,
            expr: value,
            at: attr.start,
            end: attr.end,
            element: node,
          })
      }
      break
    }
    case 'Property':
    case 'ObjectProperty':
      if (!node.computed && (node.key.name ?? node.key.value) === 'icon' && !node.method)
        unit.sites.push({ soft: true, expr: node.value, at: node.start })
      break
  }
}
