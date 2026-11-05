const WRAPPERS = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'ParenthesizedExpression',
  'TSTypeAssertion',
])

export const unwrap = (node) => {
  while (node && WRAPPERS.has(node.type)) node = node.expression
  return node
}

export const literal = (expr) => {
  const v = unwrap(expr)
  return (v.type === 'Literal' || v.type === 'StringLiteral') && typeof v.value === 'string'
    ? v.value
    : undefined
}
