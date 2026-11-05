import { createRequire } from 'node:module'

const require = createRequire(new URL('../../packages/cli/package.json', import.meta.url))

/** Find source patterns that make a displayed sample harder to read or compile. */
export function scanPatternSource(text, file, offset = 0) {
  const ts = require('typescript')
  const source = ts.createSourceFile(
    'sample.tsx',
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const findings = []
  const line = (node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line
  const report = (rule, node) => findings.push({ file, line: offset + line(node) + 1, rule })
  const inJsx = (node) => {
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (ts.isJsxExpression(parent)) return true
      if (ts.isSourceFile(parent)) return false
    }
    return false
  }
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const attrs = [...node.attributes.properties]
      if (attrs.length > 2) {
        const lines = attrs.map(line)
        const close = source.getLineAndCharacterOfPosition(node.end - 1).line
        if (
          new Set(lines).size !== lines.length ||
          lines.includes(line(node)) ||
          lines.includes(close)
        )
          report('three-plus attributes share a line or closing tag', node)
      }
    }
    if (ts.isJsxAttribute(node) && /^on[A-Z]/.test(node.name.text)) {
      let expression = node.initializer?.expression
      while (expression && ts.isParenthesizedExpression(expression))
        expression = expression.expression
      if (
        expression &&
        (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) &&
        ts.isBlock(expression.body) &&
        expression.body.statements.length > 1
      )
        report('multi-statement JSX handler', node)
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression
      const field = method.expression
      if (
        ts.isPropertyAccessExpression(field) &&
        ts.isIdentifier(field.expression) &&
        field.expression.text === 'props' &&
        inJsx(node)
      )
        report(
          method.name.text === 'map'
            ? 'direct props field map in JSX'
            : 'direct props computation in JSX',
          node,
        )
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'derived' &&
      !ts.isVariableDeclaration(node.parent) &&
      !ts.isPropertyAssignment(node.parent)
    )
      report('unnamed derived candidate', node)
    ts.forEachChild(node, visit)
  }
  visit(source)
  return findings
}
