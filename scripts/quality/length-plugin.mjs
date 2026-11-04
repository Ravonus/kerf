// Collect Oxlint's parsed functions, including files the main lint excludes.
import { fileLimit, lineCount } from './length-metrics.mjs'

const functionTypes = ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']
const nameOf = node => node?.name ?? node?.value ?? (node?.type === 'MemberExpression' ? `${nameOf(node.object)}.${nameOf(node.property)}` : '')

function label(node) {
  const parent = node.parent
  if (node.id?.name) return node.id.name
  if (parent?.type === 'VariableDeclarator') return nameOf(parent.id)
  if (parent?.type === 'Property' || parent?.type === 'MethodDefinition' || parent?.type === 'PropertyDefinition') {
    const owner = parent.parent?.parent
    const className = owner?.type === 'ClassDeclaration' || owner?.type === 'ClassExpression' ? nameOf(owner.id) : ''
    return className ? `${className}.${nameOf(parent.key)}` : nameOf(parent.key)
  }
  if (parent?.type === 'AssignmentExpression') return nameOf(parent.left)
  if (parent?.type === 'CallExpression') {
    const call = nameOf(parent.callee) || 'call'
    const title = parent.arguments.find(arg => arg.type === 'Literal' && typeof arg.value === 'string')?.value
    return title ? `${call}(${title})` : `${call}(callback)`
  }
  return 'anonymous'
}

export default {
  meta: { name: 'length' },
  rules: {
    collect: {
      create(context) {
        const source = context.sourceCode, stack = [], used = new Map()
        function report(node, id, count, kind) {
          const tokens = source.getTokens(node).reduce((sum, token) => sum + String(token.value).length, 0)
          context.report({ node, message: JSON.stringify({ id, count, tokens, kind, start: node.loc.start.line, end: node.loc.end.line }) })
        }
        function enter(node) {
          const part = label(node)
          const path = [...stack, part].join('/')
          stack.push(part)
          const occurrence = (used.get(path) ?? 0) + 1
          used.set(path, occurrence)
          const count = lineCount(source.text.slice(...node.range))
          if (count > 80) report(node, `${path}${occurrence === 1 ? '' : `#${occurrence}`}`, count, 'function')
        }
        const visitors = {
          Program(node) {
            const count = lineCount(source.text)
            if (count > fileLimit(context.filename)) report(node, '', count, 'file')
          },
        }
        for (const type of functionTypes) {
          visitors[type] = enter
          visitors[`${type}:exit`] = () => { stack.pop() }
        }
        return visitors
      },
    },
  },
}
