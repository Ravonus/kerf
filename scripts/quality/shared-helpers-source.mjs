// Detect HTML esc copies and module-relative paths that resolve to the repository root.
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(new URL('../../packages/cli/package.json', import.meta.url))
const ts = require('typescript')

function pathValue(node, values, file) {
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node))
    return pathValue(node.expression, values, file)
  if (ts.isStringLiteral(node)) return { value: node.text, anchored: false }
  if (ts.isIdentifier(node)) return values.get(node.text)
  if (node.getText() === 'import.meta.url')
    return { value: pathToFileURL(file).href, anchored: true }
  if (node.getText() === 'import.meta.dirname') return { value: dirname(file), anchored: true }
  if (ts.isNewExpression(node) && node.expression.getText() === 'URL') {
    const args = node.arguments?.map((a) => pathValue(a, values, file)) ?? []
    if (args.length !== 2 || args.some((a) => !a || typeof a.value !== 'string')) return
    try {
      return {
        value: new URL(args[0].value, args[1].value).href,
        anchored: args.some((a) => a.anchored),
      }
    } catch {
      return
    }
  }
  if (!ts.isCallExpression(node)) return
  const call = node.expression
  const name = ts.isIdentifier(call)
    ? values.get(call.text)?.builtin
    : ts.isPropertyAccessExpression(call) && ts.isIdentifier(call.expression)
      ? values.get(call.expression.text)?.namespace === 'path'
        ? call.name.text
        : values.get(call.expression.text)?.namespace === 'url' &&
            call.name.text === 'fileURLToPath'
          ? call.name.text
          : undefined
      : undefined
  if (!name) return
  const args = node.arguments.map((a) => pathValue(a, values, file))
  if (args.some((a) => !a || typeof a.value !== 'string')) return
  const anchored = args.some((a) => a.anchored)
  const items = args.map((a) => a.value)
  if (name === 'fileURLToPath' && items.length === 1) {
    try {
      return { value: fileURLToPath(items[0]), anchored }
    } catch {
      return
    }
  }
  if (name === 'dirname' && items.length === 1) return { value: dirname(items[0]), anchored }
  if ((name === 'join' || name === 'resolve') && items.length)
    return { value: (name === 'join' ? join : resolve)(...items), anchored }
}

function fullEscape(node) {
  if (
    !ts.isArrowFunction(node) &&
    !ts.isFunctionExpression(node) &&
    !ts.isFunctionDeclaration(node)
  )
    return false
  const chars = new Set()
  let apostrophe = false
  function visit(part) {
    if (
      ts.isCallExpression(part) &&
      ts.isPropertyAccessExpression(part.expression) &&
      ['replace', 'replaceAll'].includes(part.expression.name.text)
    ) {
      const first = part.arguments[0]
      if (first && (ts.isRegularExpressionLiteral(first) || ts.isStringLiteral(first))) {
        const pattern = first.text
        if (pattern.includes("'") || pattern.includes('\\x27') || pattern.includes('\\u0027'))
          apostrophe = true
        for (const char of ['&', '<', '>']) if (pattern.includes(char)) chars.add(char)
        if (pattern.includes('"') || pattern.includes('\\x22') || pattern.includes('\\u0022'))
          chars.add('"')
      }
    }
    ts.forEachChild(part, visit)
  }
  visit(node)
  return chars.size === 4 && !apostrophe
}

/** Inspect syntax, not comments, literals or embedded fixture text. */
export function inspectSource(path, text, cwd, roots, escapes) {
  const kind = path.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : path.endsWith('.jsx')
      ? ts.ScriptKind.JSX
      : ts.ScriptKind.TS
  const ast = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind)
  const values = new Map(),
    problems = []
  for (const statement of ast.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
      continue
    const module = statement.moduleSpecifier.text.replace(/^node:/, '')
    if (!['path', 'url'].includes(module)) continue
    const clause = statement.importClause
    if (clause?.name) values.set(clause.name.text, { namespace: module })
    const named = clause?.namedBindings
    if (named && ts.isNamespaceImport(named)) values.set(named.name.text, { namespace: module })
    if (named && ts.isNamedImports(named))
      for (const item of named.elements) {
        const name = (item.propertyName ?? item.name).text
        if (
          (module === 'path' && ['dirname', 'join', 'resolve'].includes(name)) ||
          (module === 'url' && name === 'fileURLToPath')
        )
          values.set(item.name.text, { builtin: name })
      }
  }
  const add = (node, name) =>
    problems.push(
      `${path}:${ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1}: duplicate ${name}`,
    )
  function visit(node, scope = values, owner) {
    if (ts.isFunctionLike(node) || ts.isBlock(node)) {
      scope = new Map(scope)
      // Function declarations bind before statements in their block run.
      for (const statement of node.statements ?? [])
        if (ts.isFunctionDeclaration(statement) && statement.name)
          scope.set(statement.name.text, undefined)
      if (ts.isFunctionLike(node)) {
        owner = node
        for (const param of node.parameters)
          if (ts.isIdentifier(param.name)) scope.set(param.name.text, undefined)
      }
    }
    if (roots && ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const value = pathValue(node.initializer, scope, resolve(cwd, path))
      scope.set(node.name.text, value)
      if (value) {
        if ((value.anchored && value.value === resolve(cwd)) || node.name.text === 'repoRoot')
          add(node, 'repoRoot')
      }
    }
    if (roots && ts.isArrowFunction(node) && !ts.isBlock(node.body)) {
      const value = pathValue(node.body, scope, resolve(cwd, path))
      if (value?.anchored && resolve(value.value) === resolve(cwd)) add(node, 'repoRoot')
    }
    if (roots && ts.isReturnStatement(node) && node.expression && owner) {
      const value = pathValue(node.expression, scope, resolve(cwd, path))
      if (value?.anchored && resolve(value.value) === resolve(cwd)) add(node, 'repoRoot')
    }
    if (
      escapes &&
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      ['esc', 'escapeHtml', 'escapeHTML'].includes(node.name.text) &&
      node.initializer &&
      fullEscape(node.initializer)
    )
      add(node, 'esc')
    if (
      escapes &&
      ts.isFunctionDeclaration(node) &&
      ['esc', 'escapeHtml', 'escapeHTML'].includes(node.name?.text) &&
      fullEscape(node)
    )
      add(node, 'esc')
    ts.forEachChild(node, (child) => visit(child, scope, owner))
  }
  visit(ast)
  return problems
}
