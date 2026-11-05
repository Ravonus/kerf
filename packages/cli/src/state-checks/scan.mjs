import ts from 'typescript'

const KEEPS_OBJECTS = new Set([
  'map',
  'filter',
  'flatMap',
  'slice',
  'sort',
  'toSorted',
  'reverse',
  'concat',
  'find',
  'at',
  'structuredClone',
])
const ESCAPES = new Set(['untrack', 'optimistic'])

export function scan(rel, text, queries, report) {
  const sf = ts.createSourceFile(
    rel,
    text,
    ts.ScriptTarget.Latest,
    true,
    /\.[jt]sx$/.test(rel) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const frames = [{ handles: new Set(), values: new Set() }]
  const { peel, isQueryCall, isFetch, isHandle, serverValue } = analysis(queries, frames)

  const returned = (fn) => {
    if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return undefined
    if (!ts.isBlock(fn.body)) return fn.body
    const r = fn.body.statements.find(ts.isReturnStatement)
    return r?.expression
  }
  /** The first handle a function's body reads: the source `state.linked` follows. */
  function handleIn(node) {
    /** @type {string | undefined} */
    let found
    const walk = (n) => {
      if (found) return
      if (ts.isPropertyAccessExpression(n) && n.name.text === 'value' && isHandle(n.expression))
        found = n.expression.getText(sf)
      else ts.forEachChild(n, walk)
    }
    walk(node)
    return found
  }
  const flag = (node, why) => report('S001', node.getStart(sf), node.end, why)

  const context = {
    sf,
    frames,
    report,
    peel,
    isQueryCall,
    isFetch,
    serverValue,
    returned,
    handleIn,
    flag,
  }
  const visit = makeVisitor(context)
  visit(sf)
}

function analysis(queries, frames) {
  const has = (kind, name) => frames.some((f) => f[kind].has(name))
  const peel = (e) => {
    while (
      ts.isParenthesizedExpression(e) ||
      ts.isAsExpression(e) ||
      ts.isNonNullExpression(e) ||
      ts.isSatisfiesExpression(e)
    )
      e = e.expression
    return e
  }

  const isQueryCall = (e) =>
    ts.isCallExpression(e) &&
    (ts.isIdentifier(e.expression)
      ? queries.has(e.expression.text)
      : ts.isPropertyAccessExpression(e.expression) &&
        e.expression.name.text === 'live' &&
        ts.isIdentifier(e.expression.expression) &&
        queries.has(e.expression.expression.text))
  const isFetch = (e) =>
    ts.isCallExpression(e) &&
    ts.isPropertyAccessExpression(e.expression) &&
    e.expression.name.text === 'fetch' &&
    ts.isIdentifier(e.expression.expression) &&
    queries.has(e.expression.expression.text)
  const isHandle = (e) => {
    e = peel(e)
    return isQueryCall(e) || (ts.isIdentifier(e) && has('handles', e.text))
  }

  /** The expression holds a whole server object or array, or a derived copy of one. A picked field isn't one. */
  function serverValue(e) {
    e = peel(e)
    if (ts.isIdentifier(e)) return has('values', e.text)
    if (ts.isAwaitExpression(e))
      return isFetch(peel(e.expression)) || isQueryCall(peel(e.expression))
    if (ts.isPropertyAccessExpression(e)) return e.name.text === 'value' && isHandle(e.expression)
    if (ts.isElementAccessExpression(e)) return serverValue(e.expression)
    if (
      ts.isBinaryExpression(e) &&
      [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(
        e.operatorToken.kind,
      )
    )
      return serverValue(e.left) || serverValue(e.right)
    if (ts.isConditionalExpression(e)) return serverValue(e.whenTrue) || serverValue(e.whenFalse)
    if (ts.isCallExpression(e)) {
      const c = e.expression
      return (
        ts.isPropertyAccessExpression(c) &&
        KEEPS_OBJECTS.has(c.name.text) &&
        serverValue(c.expression)
      )
    }
    if (ts.isArrayLiteralExpression(e))
      return e.elements.some((x) => ts.isSpreadElement(x) && serverValue(x.expression))
    if (ts.isObjectLiteralExpression(e))
      return e.properties.some((p) => ts.isSpreadAssignment(p) && serverValue(p.expression))
    return false
  }

  return { peel, isQueryCall, isFetch, isHandle, serverValue }
}

function makeVisitor(context) {
  const { sf, frames, peel, isQueryCall, serverValue, flag } = context
  function visit(node) {
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && ESCAPES.has(node.name.text))
      return
    if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name) && ESCAPES.has(node.name.text))
      return
    const fn = ts.isFunctionLike(node)
    if (fn) frames.push({ handles: new Set(), values: new Set() })
    try {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        const init = peel(node.initializer)
        if (isQueryCall(init)) frames.at(-1).handles.add(node.name.text)
        else if (serverValue(init)) frames.at(-1).values.add(node.name.text)
      }
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isPropertyAccessExpression(node.left) &&
        node.left.name.text === 'value' &&
        serverValue(node.right)
      )
        flag(
          node,
          `A server value is copied into \`${node.left.expression.getText(sf)}\`: the copy goes stale, and its rows lose their identity.`,
        )
      if (ts.isCallExpression(node) && visitCall(node, context, visit)) return
      ts.forEachChild(node, visit)
    } finally {
      if (fn) frames.pop()
    }
  }
  return visit
}

function visitCall(node, context, visit) {
  const { sf, frames, report, peel, isFetch, serverValue, returned, handleIn, flag } = context
  const c = node.expression
  if (ts.isIdentifier(c) && ESCAPES.has(c.text)) return true
  if (
    ts.isPropertyAccessExpression(c) &&
    ts.isIdentifier(c.expression) &&
    c.expression.text === 'state' &&
    c.name.text === 'linked'
  ) {
    const source = handleIn(node.arguments[0] ?? node)
    if (source && node.arguments.length < 2) {
      const at = node.arguments[0].end
      report(
        'S012',
        node.getStart(sf),
        node.end,
        `\`state.linked\` over \`${source}\` has no \`key\`: a refetch resets what someone is typing.`,
        {
          description: `Key it by the row: \`{ key: () => ${source}.value?.id }\``,
          safe: false,
          edits: [[at, at, `, { key: () => ${source}.value?.id }`]],
        },
      )
    }
    return true // the declared editing path: not S001
  }
  if (
    ts.isIdentifier(c) &&
    c.text === 'state' &&
    node.arguments[0] &&
    serverValue(node.arguments[0])
  )
    flag(
      node,
      'A server value is copied into `state`: the copy goes stale, and its rows lose their identity.',
    )
  if (ts.isPropertyAccessExpression(c) && c.name.text === 'set' && node.arguments.length === 1) {
    const r = returned(node.arguments[0])
    if (r && serverValue(r))
      flag(
        node,
        `A server value is copied into \`${c.expression.getText(sf)}\`: the copy goes stale, and its rows lose their identity.`,
      )
  }
  // The value a callback gets from a query: `watch(() => q.value, v => …)`, `q.fetch().then(v => …)`.
  const fed =
    ts.isIdentifier(c) &&
    c.text === 'watch' &&
    returned(node.arguments[0]) &&
    serverValue(returned(node.arguments[0]))
      ? node.arguments[1]
      : ts.isPropertyAccessExpression(c) && c.name.text === 'then' && isFetch(peel(c.expression))
        ? node.arguments[0]
        : undefined
  if (
    fed &&
    (ts.isArrowFunction(fed) || ts.isFunctionExpression(fed)) &&
    ts.isIdentifier(fed.parameters[0]?.name)
  ) {
    frames.push({ handles: new Set(), values: new Set([fed.parameters[0].name.text]) })
    ts.forEachChild(node, visit)
    frames.pop()
    return true
  }
}
