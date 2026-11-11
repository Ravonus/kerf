import { unwrap } from './compile-unwrap.mjs'

const empty = () => ({ values: new Set(), shapes: [], dynamic: null })
const merge = (into, r) => {
  for (const v of r.values) into.values.add(v)
  into.shapes.push(...r.shapes)
  into.dynamic ??= r.dynamic
  return into
}
const text = (unit, n) => unit.code.slice(n.start, n.end).slice(0, 60)

function exported(ctx, file, name, seen) {
  const u = ctx.units.get(file)
  if (!u) return { ...empty(), dynamic: `export ${name}` }
  const re = u.exports.get(name)
  if (re?.reexport) return exported(ctx, re.reexport, re.name, seen)
  if (u.bindings.has(name)) return identifier(ctx, u, name, seen)
  for (const star of u.stars ?? []) {
    const r = exported(ctx, star, name, seen)
    if (!r.dynamic) return r
  }
  return { ...empty(), dynamic: `export ${name}` }
}

function identifier(ctx, unit, name, seen) {
  if (name === 'undefined') return empty()
  const id = `${unit.file}#${name}`
  if (seen.has(id)) return empty()
  seen.add(id)
  const imp = unit.imports.get(name)
  if (imp) {
    if (imp.source === '@kerf/veneer-icons' || imp.source.startsWith('@kerf/veneer-icons/'))
      return empty()
    if (imp.target && imp.imported !== '*') return exported(ctx, imp.target, imp.imported, seen)
    return { ...empty(), dynamic: name }
  }
  const list = unit.bindings.get(name)
  if (!list) return { ...empty(), dynamic: name }
  const out = empty()
  for (const b of list) merge(out, binding(ctx, unit, b, seen))
  seen.delete(id)
  return out
}

function pick(ctx, unit, from, keys, seen) {
  let cur = from
  for (const key of keys ?? []) {
    const next = empty()
    next.dynamic = cur.dynamic
    for (const { shape, unit: u } of cur.shapes) merge(next, property(ctx, u, shape, key, seen))
    cur = next
  }
  return cur
}

function binding(ctx, unit, b, seen) {
  if (b.kind === 'value') return pick(ctx, unit, expression(ctx, unit, b.expr, seen), b.keys, seen)
  if (b.kind === 'each') {
    const list = expression(ctx, unit, b.of, seen),
      items = empty()
    items.dynamic = list.dynamic
    for (const { shape, unit: u } of list.shapes)
      if (shape.type === 'ArrayExpression')
        for (const el of shape.elements) if (el) merge(items, expression(ctx, u, el, seen))
    return pick(ctx, unit, items, b.keys, seen)
  }
  if (b.kind === 'prop')
    return b.key ? forwarded(ctx, b.comp, b.key, seen) : { ...empty(), dynamic: `${b.comp} props` }
  return { ...empty(), dynamic: `${b.comp} props` }
}

function forwarded(ctx, comp, prop, seen) {
  const out = empty()
  for (const { unit, use } of ctx.usesOf.get(`${comp}.${prop}`) ?? [])
    merge(out, expression(ctx, unit, use.expr, seen))
  return out
}

function property(ctx, unit, shape, key, seen) {
  const out = empty()
  if (shape.type === 'ObjectExpression') {
    for (const p of shape.properties) {
      if (p.type === 'SpreadElement') {
        const s = expression(ctx, unit, p.argument, seen)
        for (const x of s.shapes) merge(out, property(ctx, x.unit, x.shape, key, seen))
        out.dynamic ??= s.dynamic
        continue
      }
      const k = p.key?.name ?? p.key?.value
      if (key === null || k === key) merge(out, expression(ctx, unit, p.value, seen))
    }
  } else if (shape.type === 'ArrayExpression')
    for (const el of shape.elements) if (el) merge(out, expression(ctx, unit, el, seen))
  return out
}

function expression(ctx, unit, raw, seen = new Set()) {
  const node = unwrap(raw)
  if (!node) return empty()
  switch (node.type) {
    case 'Literal':
    case 'StringLiteral':
      return typeof node.value === 'string'
        ? { ...empty(), values: new Set([node.value]) }
        : empty()
    case 'TemplateLiteral':
      return node.expressions.length
        ? { ...empty(), dynamic: text(unit, node) }
        : { ...empty(), values: new Set([node.quasis[0].value.cooked]) }
    case 'ConditionalExpression':
      return merge(
        expression(ctx, unit, node.consequent, seen),
        expression(ctx, unit, node.alternate, seen),
      )
    case 'LogicalExpression':
      return merge(expression(ctx, unit, node.left, seen), expression(ctx, unit, node.right, seen))
    case 'ArrayExpression':
    case 'ObjectExpression':
      return { ...empty(), shapes: [{ shape: node, unit }] }
    case 'Identifier':
      return identifier(ctx, unit, node.name, seen)
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
    case 'JSXElement':
    case 'JSXFragment':
      return empty()
    case 'MemberExpression': {
      const object = unwrap(node.object)
      const key = node.computed ? (unwrap(node.property)?.value ?? null) : node.property.name
      if (object.type === 'Identifier') {
        const props = unit.bindings.get(object.name)?.find((b) => b.kind === 'props')
        if (props && key) return forwarded(ctx, props.comp, key, seen)
        const imp = unit.imports.get(object.name)
        if (imp?.imported === '*' && imp.target && key) return exported(ctx, imp.target, key, seen)
      }
      const base = expression(ctx, unit, object, seen),
        out = empty()
      out.dynamic = base.dynamic
      for (const { shape, unit: u } of base.shapes) merge(out, property(ctx, u, shape, key, seen))
      return out
    }
    case 'CallExpression': {
      // a list method hands back the list, or an item of it
      const c = node.callee
      if (
        c.type === 'MemberExpression' &&
        !c.computed &&
        ['filter', 'sort', 'toSorted', 'slice', 'reverse', 'concat'].includes(c.property.name)
      )
        return expression(ctx, unit, c.object, seen)
      if (c.type === 'MemberExpression' && !c.computed && c.property.name === 'find') {
        const base = expression(ctx, unit, c.object, seen),
          out = empty()
        out.dynamic = base.dynamic
        for (const { shape, unit: u } of base.shapes)
          merge(out, property(ctx, u, shape, null, seen))
        return out
      }
      return { ...empty(), dynamic: text(unit, node) }
    }
    default:
      return { ...empty(), dynamic: text(unit, node) }
  }
}

export function resolver(units, usesOf) {
  const ctx = { units, usesOf }
  return { expression: (unit, raw, seen) => expression(ctx, unit, raw, seen) }
}
