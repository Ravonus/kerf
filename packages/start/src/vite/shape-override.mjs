import { readFileSync } from 'node:fs'
import { parse } from './syntax.mjs'

const TAGS = new Set(['div', 'span', 'main', 'section', 'article', 'header', 'footer', 'p',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li'])

function inert(node) {
  if (node.type === 'JSXText') return true
  if (node.type === 'JSXFragment') return node.children.every(inert)
  if (node.type !== 'JSXElement') return false
  const open = node.openingElement
  if (open.name.type !== 'JSXIdentifier' || !TAGS.has(open.name.name)) return false
  if (!open.attributes.every((attr) =>
    attr.type === 'JSXAttribute' && attr.name.type === 'JSXIdentifier' &&
    (attr.name.name === 'class' || attr.name.name === 'className' ||
      /^data-[a-z0-9-]+$/.test(attr.name.name)) &&
    attr.value?.type === 'Literal' && typeof attr.value.value === 'string',
  )) return false
  return node.children.every(inert)
}

/** Extract only a closed, static local override. Never evaluate the source module. */
export function shapeOverride(file) {
  const source = readFileSync(file, 'utf8')
  const parsed = parse(file, source)
  if (parsed.errors.length) return
  const body = parsed.program.body
  const exports = body.filter((n) => n.type === 'ExportNamedDeclaration' &&
    n.declaration?.type === 'VariableDeclaration' && n.declaration.kind === 'const')
  const declarations = exports.flatMap((n) => n.declaration.declarations)
    .filter((d) => d.id.type === 'Identifier' && d.id.name === 'skeleton')
  if (declarations.length !== 1 || declarations[0].init?.type !== 'Identifier') return
  if (body.some((n) => n.type === 'ExportAllDeclaration' ||
    (n.type === 'ExportNamedDeclaration' && n.specifiers.some((s) =>
      (s.exported.name ?? s.exported.value) === 'skeleton')))) return
  const name = declarations[0].init.name
  const candidates = body.flatMap((n) => {
    const decl = n.type === 'ExportNamedDeclaration' ? n.declaration : n
    return decl?.type === 'VariableDeclaration' && decl.kind === 'const'
      ? decl.declarations.filter((d) => d.id.type === 'Identifier' && d.id.name === name)
      : []
  })
  if (candidates.length !== 1) return
  const fn = candidates[0].init
  if (fn?.type !== 'ArrowFunctionExpression' || fn.async || fn.params.length || !inert(fn.body))
    return
  const jsx = source.slice(fn.body.start, fn.body.end)
  return `export default function Skeleton() { return (${jsx}); }`
}
