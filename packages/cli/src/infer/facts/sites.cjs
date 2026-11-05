const isCap = (name) => /^[A-Z]/.test(name)

function jsxSite(ts, sf, node, enclosing) {
  const tag = node.tagName
  if (!ts.isIdentifier(tag) && !ts.isPropertyAccessExpression(tag)) return null
  if (ts.isIdentifier(tag) && !isCap(tag.text)) return null
  const span = (n) => [n.getStart(sf), n.end]
  const site = {
    tag: tag.getText(sf),
    tagSpan: span(tag),
    span: span(node),
    attrs: [],
    spreads: [],
    children: null,
    in: enclosing ?? null,
  }
  for (const a of node.attributes.properties) {
    if (ts.isJsxSpreadAttribute(a)) {
      site.spreads.push({ span: span(a.expression), text: a.expression.getText(sf) })
      continue
    }
    const raw = a.name.getText(sf)
    const bind = raw.startsWith('bind:')
    const name = bind ? raw.slice(5) : raw
    if (name === 'key') continue
    const value = a.initializer
    if (!value) {
      site.attrs.push({ name, literal: 'true', bind })
      continue
    }
    if (ts.isStringLiteral(value)) {
      site.attrs.push({
        name,
        literal: 'string',
        exact: JSON.stringify(value.text),
        whole: span(a),
        bind,
      })
      continue
    }
    const expr = value.expression
    if (!expr) continue
    const lambda = ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)
    site.attrs.push({
      name,
      span: span(expr),
      whole: span(a),
      bind,
      raw: bind ? span(a.name) : undefined,
      untypedFn: (lambda && expr.parameters.some((p) => !p.type)) || undefined,
      value: ts.isIdentifier(expr) && isCap(expr.text) ? expr.text : undefined,
    })
  }
  if (ts.isJsxOpeningElement(node)) {
    const kids = node.parent.children.filter((c) => !(ts.isJsxText(c) && !c.text.trim()))
    if (kids.length) {
      const only = kids.length === 1 ? kids[0] : null
      const expr = only && ts.isJsxExpression(only) ? only.expression : null
      const lambda = expr && (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr))
      site.children = lambda
        ? {
            fn: true,
            span: span(expr),
            untypedFn: expr.parameters.some((p) => !p.type) || undefined,
          }
        : { fn: false }
    }
  }
  return site
}

/** `const views = { a: A }`, `pick(A, B)`, `<X icon={A} />`: an identifier that leaves JSX tag position. */
function escapes(ts, node) {
  const up = node.parent
  if (ts.isJsxOpeningLikeElement?.(up) && up.tagName === node) return false
  if (ts.isJsxClosingElement(up)) return false
  if (ts.isFunctionDeclaration(up) || (ts.isVariableDeclaration(up) && up.name === node))
    return false
  if (ts.isPropertyAccessExpression(up) && up.name === node) return false
  if (
    ts.isExportSpecifier(up) ||
    ts.isExportAssignment(up) ||
    ts.isImportSpecifier(up) ||
    ts.isImportClause(up)
  )
    return false
  if (ts.isTypeQueryNode(up)) return false
  return true
}

/** The names an initializer can hand back: `pick(A, B)`, `{ a: A, b: B }`, `views[k]`, `views.a`, `hoc(A)`, `x ? A : B`. */
function holds(ts, init) {
  const name = (e) => (ts.isIdentifier(e) ? [e.text] : [])
  if (ts.isCallExpression(init)) return init.arguments.flatMap((a) => name(a)).filter(isCap)
  if (ts.isConditionalExpression(init))
    return [...name(init.whenTrue), ...name(init.whenFalse)].filter(isCap)
  if (ts.isObjectLiteralExpression(init))
    return init.properties
      .flatMap((p) =>
        ts.isPropertyAssignment(p)
          ? name(p.initializer)
          : ts.isShorthandPropertyAssignment(p)
            ? [p.name.text]
            : [],
      )
      .filter(isCap)
  if (ts.isElementAccessExpression(init) || ts.isPropertyAccessExpression(init))
    return name(init.expression)
  return []
}

const isOpening = (ts, n) => ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)

module.exports = { isCap, jsxSite, escapes, holds, isOpening }
