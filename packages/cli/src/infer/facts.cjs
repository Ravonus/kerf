// What one file says about its components, from syntax alone (research 41 §4). No checker here: this runs on every save
// and is cached by content, so the common file, with nothing to infer, costs a parse. CommonJS because the tsserver
// plugin loads it synchronously; `ts` is passed in because a plugin must use the TypeScript that hosts it.

const { createHash } = require('node:crypto')

const hashOf = text => createHash('sha1').update(text).digest('base64url').slice(0, 16)
const isCap = name => /^[A-Z]/.test(name)
/** The comment a generated annotation starts with. It keeps the type regenerable; deleting it makes the type yours. */
const MARK = '/*inferred*/'

function isExported(ts, node) {
  return !!ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some(m => m.kind === ts.SyntaxKind.ExportKeyword)
}

const walk = (ts, node, visit) => {
  const go = n => { if (visit(n) !== false) ts.forEachChild(n, go) }
  ts.forEachChild(node, go)
}

/** A function a component could be: the node, its name, and the parameter it would type. */
function componentAt(ts, node) {
  if (ts.isFunctionDeclaration(node) && node.name && isCap(node.name.text)) return { fn: node, name: node.name.text, nameNode: node.name, holder: node }
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && isCap(node.name.text) && !node.type && node.initializer) {
    const init = node.initializer
    if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) return { fn: init, name: node.name.text, nameNode: node.name, holder: node.parent.parent }
  }
  return null
}

const hasJsx = (ts, node) => {
  let found = false
  walk(ts, node, n => {
    if (found) return false
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) found = true
    return !found
  })
  return found
}

/** A parameter pattern's keys: `{ a, b = 1, c: d, ...rest }`. */
function patternKeys(ts, sf, pattern, out) {
  for (const el of pattern.elements) {
    if (el.dotDotDotToken) { if (ts.isIdentifier(el.name)) out.rest = el.name.text; continue }
    const key = el.propertyName && ts.isIdentifier(el.propertyName) ? el.propertyName.text : ts.isIdentifier(el.name) ? el.name.text : null
    if (!key) { out.opaque = true; continue }
    if (ts.isIdentifier(el.name)) out.aliases.set(el.name.text, key)
    const entry = out.keys.get(key) ?? { uses: [] }
    if (el.initializer) entry.fallback = [el.initializer.getStart(sf), el.initializer.end]
    out.keys.set(key, entry)
  }
}

/** Reads and writes of the prop `key` at `node`, the expression that names it. */
function classify(ts, sf, node) {
  const up = node.parent
  const span = n => [n.getStart(sf), n.end]
  if ((ts.isPostfixUnaryExpression(up) || ts.isPrefixUnaryExpression(up)) && (up.operator === ts.SyntaxKind.PlusPlusToken || up.operator === ts.SyntaxKind.MinusMinusToken)) return { as: 'number', span: span(node) }
  if (ts.isBinaryExpression(up) && up.left === node) {
    const op = up.operatorToken.kind
    if (op === ts.SyntaxKind.EqualsToken || op === ts.SyntaxKind.PlusEqualsToken) return { as: 'write', span: span(node), value: span(up.right) }
    if (op >= ts.SyntaxKind.FirstCompoundAssignment && op <= ts.SyntaxKind.LastCompoundAssignment) return { as: 'number', span: span(node) }
  }
  if (ts.isCallExpression(up) && up.expression === node) return { as: 'call', span: span(node), args: up.arguments.map(span) }
  if ((ts.isPropertyAccessExpression(up) && up.expression === node) || (ts.isNonNullExpression(up))) {
    const member = ts.isPropertyAccessExpression(up) ? up.name.text : null
    if (member) return { as: 'member', span: span(up), member }
  }
  if (ts.isJsxExpression(up) && ts.isJsxAttribute(up.parent)) return { as: 'context', span: span(node) }
  return { as: 'read', span: span(node) }
}

/** Every use of the props in a component's body. */
function bodyUses(ts, sf, comp) {
  const { fn, param, info } = comp
  const names = new Set(ts.isIdentifier(param.name) ? [param.name.text] : [])
  const use = (key, node) => {
    const entry = info.keys.get(key) ?? { uses: [] }
    entry.uses.push(classify(ts, sf, node))
    info.keys.set(key, entry)
  }
  const shadows = (node, name) => node.parameters?.some(p => ts.isIdentifier(p.name) && p.name.text === name)
  const visit = (node, scope) => {
    // `const { a } = props`, `let n = props.n`: another name for the prop (research 40). Only the first level.
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const init = node.initializer
      if (ts.isIdentifier(init) && scope.has(init.text) && ts.isObjectBindingPattern(node.name)) patternKeys(ts, sf, node.name, info)
      else if (ts.isPropertyAccessExpression(init) && ts.isIdentifier(init.expression) && scope.has(init.expression.text) && ts.isIdentifier(node.name)) {
        info.aliases.set(node.name.text, init.name.text)
        if (!info.keys.has(init.name.text)) info.keys.set(init.name.text, { uses: [] })
        return
      }
    }
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && scope.has(node.expression.text)) return use(node.name.text, node)
    if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression) && scope.has(node.expression.text)) {
      if (ts.isStringLiteralLike(node.argumentExpression)) return use(node.argumentExpression.text, node)
      info.opaque = true
    }
    if (ts.isIdentifier(node) && info.aliases.has(node.text) && ts.isExpressionNode?.(node) !== false) {
      const up = node.parent
      const named = (ts.isPropertyAccessExpression(up) && up.name === node) || (ts.isPropertyAssignment(up) && up.name === node) || ts.isBindingElement(up) || (ts.isVariableDeclaration(up) && up.name === node) || ts.isJsxAttribute(up)
      if (!named) use(info.aliases.get(node.text), node)
    }
    if (ts.isFunctionLike(node)) {
      let inner = scope
      for (const n of scope) if (shadows(node, n)) { inner = new Set(scope); inner.delete(n) }
      ts.forEachChild(node, c => visit(c, inner))
      return
    }
    ts.forEachChild(node, c => visit(c, scope))
  }
  if (fn.body) visit(fn.body, names)
}

function jsxSite(ts, sf, node, enclosing) {
  const tag = node.tagName
  if (!ts.isIdentifier(tag) && !ts.isPropertyAccessExpression(tag)) return null
  if (ts.isIdentifier(tag) && !isCap(tag.text)) return null
  const span = n => [n.getStart(sf), n.end]
  const site = { tag: tag.getText(sf), tagSpan: span(tag), span: span(node), attrs: [], spreads: [], children: null, in: enclosing ?? null }
  for (const a of node.attributes.properties) {
    if (ts.isJsxSpreadAttribute(a)) { site.spreads.push({ span: span(a.expression), text: a.expression.getText(sf) }); continue }
    const raw = a.name.getText(sf)
    const bind = raw.startsWith('bind:')
    const name = bind ? raw.slice(5) : raw
    if (name === 'key') continue
    const value = a.initializer
    if (!value) { site.attrs.push({ name, literal: 'true', bind }); continue }
    if (ts.isStringLiteral(value)) { site.attrs.push({ name, literal: 'string', exact: JSON.stringify(value.text), whole: span(a), bind }); continue }
    const expr = value.expression
    if (!expr) continue
    const lambda = ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)
    site.attrs.push({
      name, span: span(expr), whole: span(a), bind, raw: bind ? span(a.name) : undefined,
      untypedFn: lambda && expr.parameters.some(p => !p.type) || undefined,
      value: ts.isIdentifier(expr) && isCap(expr.text) ? expr.text : undefined,
    })
  }
  if (ts.isJsxOpeningElement(node)) {
    const kids = node.parent.children.filter(c => !(ts.isJsxText(c) && !c.text.trim()))
    if (kids.length) {
      const only = kids.length === 1 ? kids[0] : null
      const expr = only && ts.isJsxExpression(only) ? only.expression : null
      const lambda = expr && (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr))
      site.children = lambda ? { fn: true, span: span(expr), untypedFn: expr.parameters.some(p => !p.type) || undefined } : { fn: false }
    }
  }
  return site
}

/** `const views = { a: A }`, `pick(A, B)`, `<X icon={A} />`: an identifier that leaves JSX tag position. */
function escapes(ts, node) {
  const up = node.parent
  if (ts.isJsxOpeningLikeElement?.(up) && up.tagName === node) return false
  if (ts.isJsxClosingElement(up)) return false
  if (ts.isFunctionDeclaration(up) || ts.isVariableDeclaration(up) && up.name === node) return false
  if (ts.isPropertyAccessExpression(up) && up.name === node) return false
  if (ts.isExportSpecifier(up) || ts.isExportAssignment(up) || ts.isImportSpecifier(up) || ts.isImportClause(up)) return false
  if (ts.isTypeQueryNode(up)) return false
  return true
}

/** The names an initializer can hand back: `pick(A, B)`, `{ a: A, b: B }`, `views[k]`, `views.a`, `hoc(A)`, `x ? A : B`. */
function holds(ts, init) {
  const name = e => (ts.isIdentifier(e) ? [e.text] : [])
  if (ts.isCallExpression(init)) return init.arguments.flatMap(a => name(a)).filter(isCap)
  if (ts.isConditionalExpression(init)) return [...name(init.whenTrue), ...name(init.whenFalse)].filter(isCap)
  if (ts.isObjectLiteralExpression(init)) return init.properties.flatMap(p => (ts.isPropertyAssignment(p) ? name(p.initializer) : ts.isShorthandPropertyAssignment(p) ? [p.name.text] : [])).filter(isCap)
  if (ts.isElementAccessExpression(init) || ts.isPropertyAccessExpression(init)) return name(init.expression)
  return []
}

const isOpening = (ts, n) => ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)

/**
 * @returns the file's facts: `comps` (untyped or generated), `sites` (capitalised JSX tags), `imports`, `wraps`
 * (`const W = hoc(Inner)`), `escaped` (component names used as values), `exports` (local names).
 */
function fileFacts(ts, file, text, options = {}) {
  const hash = hashOf(text)
  if (!/\.tsx$/.test(file)) return { file, hash, comps: [], sites: [], imports: new Map(), wraps: new Map(), escaped: new Set(), exported: new Set(), parse: null }
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const comps = [], sites = []
  const imports = new Map(), wraps = new Map(), escaped = new Set(), exported = new Set()
  let exportsLoad = false

  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && st.importClause && ts.isStringLiteral(st.moduleSpecifier)) {
      const from = st.moduleSpecifier.text
      const { name, namedBindings } = st.importClause
      if (name) imports.set(name.text, { from, name: 'default' })
      if (namedBindings && ts.isNamedImports(namedBindings)) for (const el of namedBindings.elements) imports.set(el.name.text, { from, name: (el.propertyName ?? el.name).text })
    }
    if (ts.isExportAssignment(st) && ts.isIdentifier(st.expression)) exported.add(st.expression.text)
    if (ts.isExportDeclaration(st) && st.exportClause && ts.isNamedExports(st.exportClause) && !st.moduleSpecifier) for (const el of st.exportClause.elements) exported.add((el.propertyName ?? el.name).text)
    if (isExported(ts, st) && ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === 'load') exportsLoad = true
    if (isExported(ts, st) && ts.isFunctionDeclaration(st) && st.name?.text === 'load') exportsLoad = true
  }

  const enclosing = []
  const visit = node => {
    const found = componentAt(ts, node)
    if (found) {
      const { fn, name } = found
      const param = fn.parameters?.[0]
      const typed = param?.type
      const generated = typed && text.slice(param.name.end, typed.pos + 64).includes(MARK)
      if (param && fn.parameters.length === 1 && (!typed || generated) && !param.questionToken && !param.dotDotDotToken && !fn.typeParameters && hasJsx(ts, fn)) {
        const info = { keys: new Map(), aliases: new Map(), rest: null, opaque: false }
        if (ts.isObjectBindingPattern(param.name)) patternKeys(ts, sf, param.name, info)
        else if (!ts.isIdentifier(param.name)) info.opaque = true
        const comp = {
          id: `${file}#${name}`, file, name, param, fn, info, nameSpan: [found.nameNode.getStart(sf), found.nameNode.end],
          bodySpan: [fn.getStart(sf), fn.end], exported: isExported(ts, found.holder), isDefault: (ts.canHaveModifiers(found.holder) ? ts.getModifiers(found.holder) ?? [] : []).some(m => m.kind === ts.SyntaxKind.DefaultKeyword),
          paramSpan: [param.getStart(sf), param.end], nameEnd: param.name.end, parens: !!fn.getChildren?.(sf).some(c => c.kind === ts.SyntaxKind.OpenParenToken),
          written: generated ? [param.name.end, typed.end] : null, writtenType: generated ? text.slice(typed.getStart(sf), typed.end).trim() : null,
          forwards: [], local: enclosing.length > 0, async: !!(ts.getModifiers?.(fn) ?? []).some(m => m.kind === ts.SyntaxKind.AsyncKeyword),
        }
        bodyUses(ts, sf, comp)
        comps.push(comp)
      }
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const held = holds(ts, node.initializer)
      if (held.length) wraps.set(node.name.text, held)
    }
    if (isOpening(ts, node)) {
      const site = jsxSite(ts, sf, node, enclosing[enclosing.length - 1])
      if (site) sites.push(site)
    }
    if (ts.isIdentifier(node) && isCap(node.text) && node.parent && !ts.isTypeReferenceNode(node.parent) && escapes(ts, node)) escaped.add(node.text)
    const push = found && found.fn
    if (push) enclosing.push(found.name)
    ts.forEachChild(node, visit)
    if (push) enclosing.pop()
  }
  ts.forEachChild(sf, visit)

  for (const c of comps) if (exported.has(c.name) || c.isDefault) { c.exported = true; c.isDefault ||= false }
  // Spreads and attributes forward from a component to whatever it renders.
  for (const c of comps) {
    const own = new Set([...(ts.isIdentifier(c.param.name) ? [c.param.name.text] : []), ...(c.info.rest ? [c.info.rest] : [])])
    for (const s of sites) {
      if (s.span[0] < c.fn.getStart(sf) || s.span[1] > c.fn.end) continue
      for (const sp of s.spreads) if (own.has(sp.text)) c.forwards.push({ tag: s.tag, tagSpan: s.tagSpan, given: s.attrs.map(a => a.name) })
    }
  }
  for (const c of comps) { delete c.fn; delete c.param }
  return { file, hash, comps, sites, imports, wraps, escaped, exported, exportsLoad, parse: options.keep ? sf : null }
}

module.exports = { fileFacts, hashOf, MARK }
