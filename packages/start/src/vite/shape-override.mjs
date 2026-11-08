import { readFileSync, realpathSync } from 'node:fs'
import { isAbsolute, relative } from 'node:path'
import { parse } from './syntax.mjs'

const TAGS = new Set([
  'div',
  'span',
  'main',
  'section',
  'article',
  'header',
  'footer',
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
])

function inert(node) {
  if (node.type === 'JSXText') return true
  if (node.type === 'JSXFragment') return node.children.every(inert)
  if (node.type !== 'JSXElement') return false
  const open = node.openingElement
  if (open.name.type !== 'JSXIdentifier' || !TAGS.has(open.name.name)) return false
  if (
    !open.attributes.every(
      (attr) =>
        attr.type === 'JSXAttribute' &&
        attr.name.type === 'JSXIdentifier' &&
        (attr.name.name === 'class' ||
          attr.name.name === 'className' ||
          /^data-[a-z0-9-]+$/.test(attr.name.name)) &&
        attr.value?.type === 'Literal' &&
        typeof attr.value.value === 'string',
    )
  )
    return false
  return node.children.every(inert)
}

// A function declaration has a mutable binding. Reject every other occurrence,
// including shadowed names, rather than guessing whether a write is reachable.
function isolated(body, declaration, reference) {
  const name = declaration.id?.name
  if (!name) return true
  const allowed = new Set([declaration.id, reference])
  const safe = (node) => {
    if (!node || typeof node !== 'object') return true
    if (Array.isArray(node)) return node.every(safe)
    if (node.type === 'Identifier' && node.name === 'eval') return false
    if (node.type === 'Identifier' && node.name === name && !allowed.has(node)) return false
    return Object.values(node).every(safe)
  }
  return safe(body)
}

/** Extract only a closed, static local override. Never evaluate the source module. */
export function shapeOverride(file) {
  const source = readFileSync(file, 'utf8')
  const parsed = parse(file, source)
  if (parsed.errors.length) return
  const body = parsed.program.body
  const exports = body.filter(
    (n) =>
      n.type === 'ExportNamedDeclaration' &&
      n.declaration?.type === 'VariableDeclaration' &&
      n.declaration.kind === 'const',
  )
  const declarations = exports
    .flatMap((n) => n.declaration.declarations)
    .filter((d) => d.id.type === 'Identifier' && d.id.name === 'skeleton')
  if (declarations.length !== 1 || declarations[0].init?.type !== 'Identifier') return
  if (
    body.some(
      (n) =>
        n.type === 'ExportAllDeclaration' ||
        (n.type === 'ExportNamedDeclaration' &&
          n.specifiers.some((s) => (s.exported.name ?? s.exported.value) === 'skeleton')),
    )
  )
    return
  const name = declarations[0].init.name
  const candidates = body.flatMap((n) => {
    const decl =
      n.type === 'ExportNamedDeclaration' || n.type === 'ExportDefaultDeclaration'
        ? n.declaration
        : n
    if (decl?.type === 'FunctionDeclaration' && decl.id?.name === name) return [decl]
    if (decl?.type === 'VariableDeclaration' && decl.kind === 'const')
      return decl.declarations.filter((d) => d.id.type === 'Identifier' && d.id.name === name)
    return []
  })
  if (candidates.length !== 1) return
  const candidate = candidates[0]
  if (candidate.type === 'FunctionDeclaration') {
    if (!isolated(body, candidate, declarations[0].init)) return
    return component(source, candidate)
  }
  return component(source, candidate.init)
}

function component(source, fn) {
  while (fn?.type === 'ParenthesizedExpression') fn = fn.expression
  if (
    !fn ||
    !['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration'].includes(fn.type) ||
    fn.async ||
    fn.generator ||
    fn.params.length
  )
    return
  let body =
    fn.body.type === 'BlockStatement' &&
    fn.body.body.length === 1 &&
    fn.body.body[0].type === 'ReturnStatement'
      ? fn.body.body[0].argument
      : fn.body
  // `return (` and a multi-line tree, as a formatter writes it.
  while (body?.type === 'ParenthesizedExpression') body = body.expression
  if (!body || !inert(body)) return
  const jsx = source.slice(body.start, body.end)
  return `export default function Skeleton() { return (${jsx}); }`
}

// Follow one direct import only; imported source must itself export the component.
export function importedOverride(file) {
  const parsed = parse(file, readFileSync(file, 'utf8'))
  if (parsed.errors.length) return
  const body = parsed.program.body
  const declarations = body
    .flatMap((n) =>
      n.type === 'ExportNamedDeclaration' &&
      n.declaration?.type === 'VariableDeclaration' &&
      n.declaration.kind === 'const'
        ? n.declaration.declarations
        : [],
    )
    .filter((d) => d.id.name === 'skeleton')
  if (declarations.length !== 1 || declarations[0].init?.type !== 'Identifier') return
  if (
    body.some(
      (n) =>
        n.type === 'ExportAllDeclaration' ||
        (n.type === 'ExportNamedDeclaration' &&
          n.specifiers.some((s) => (s.exported.name ?? s.exported.value) === 'skeleton')),
    )
  )
    return
  const name = declarations[0].init.name
  const matches = body.flatMap((n) =>
    n.type === 'ImportDeclaration' && n.importKind !== 'type'
      ? n.specifiers
          .filter((s) => s.local.name === name && s.importKind !== 'type')
          .map((s) => ({ spec: n.source.value, binding: s }))
      : [],
  )
  if (matches.length !== 1) return
  const { spec, binding } = matches[0]
  if (binding.type === 'ImportDefaultSpecifier') return { spec, name: 'default' }
  if (binding.type === 'ImportSpecifier') return { spec, name: binding.imported.name }
}

function dedicated(file, name) {
  const source = readFileSync(file, 'utf8')
  const parsed = parse(file, source)
  if (parsed.errors.length) return
  const matches = []
  for (const node of parsed.program.body) {
    if (
      node.type === 'ExportAllDeclaration' ||
      (node.type === 'ExportNamedDeclaration' && node.source)
    )
      return
    if (name === 'default' && node.type === 'ExportDefaultDeclaration')
      matches.push(node.declaration)
    if (
      node.type === 'ExportNamedDeclaration' &&
      node.declaration?.type === 'FunctionDeclaration' &&
      node.declaration.id?.name === name
    )
      matches.push(node.declaration)
    if (
      node.type === 'ExportNamedDeclaration' &&
      node.declaration?.type === 'VariableDeclaration' &&
      node.declaration.kind === 'const'
    ) {
      for (const item of node.declaration.declarations)
        if (item.id.type === 'Identifier' && item.id.name === name) matches.push(item.init)
    }
  }
  if (matches.length !== 1) return
  if (matches[0].type === 'FunctionDeclaration' && !isolated(parsed.program.body, matches[0]))
    return
  return component(source, matches[0])
}

/** Resolve a direct dedicated source through Vite, bounded to non-server project files. */
export async function resolveImportedOverride(ctx, file, root, onMissing) {
  const requested = importedOverride(file)
  if (!requested || /[?#]/.test(requested.spec) || /^(?:[a-z][\w+.-]*:|\/\/)/i.test(requested.spec))
    return
  const found = await ctx.resolve(requested.spec, file, { skipSelf: true })
  if (!found && /^\.{1,2}\//.test(requested.spec)) onMissing?.(requested.spec)
  if (!found || found.external || !isAbsolute(found.id) || !/\.[jt]sx$/.test(found.id)) return
  const blocked = (base, target) => {
    const rel = relative(base, target).replace(/\\/g, '/')
    return (
      rel === '..' ||
      rel.startsWith('../') ||
      isAbsolute(rel) ||
      /(^|\/)node_modules\//.test(rel) ||
      /(^|\/)server\//.test(rel) ||
      /\.server\.[jt]sx$/.test(rel)
    )
  }
  try {
    if (blocked(root, found.id) || blocked(realpathSync(root), realpathSync(found.id))) return
    return { file: found.id, code: dedicated(found.id, requested.name) }
  } catch {}
}
