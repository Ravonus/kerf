// Map proven JSX box/value assignability errors. Type names alone are not evidence:
// value members must come from the resolved core State/Derived exports.
const { coreMembers, known } = require('./core-boxes.cjs')
const assignmentCodes = new Set([2322, 2739, 2740, 2741])

function boxKind(ts, checker, type, members) {
  if (!known(ts, type)) return null
  if (type.isUnion()) {
    const nullable = ts.TypeFlags.Null | ts.TypeFlags.Undefined
    const parts = type.types.filter((part) => !(part.flags & nullable))
    const kinds = new Set(parts.map((part) => boxKind(ts, checker, part, members)))
    return kinds.size === 1 ? [...kinds][0] : null
  }
  if (members.roots.has(type.getSymbol()) || members.roots.has(type.aliasSymbol)) return 'box'
  const value = checker.getPropertyOfType(type, 'value')
  const declarations = value?.getDeclarations() ?? []
  const names = new Set(checker.getPropertiesOfType(type).map((property) => property.name))
  // A projection of just .value is not evidence of the complete box contract.
  return members.shapes.some((shape) => shape.names.length > 1
    && shape.names.every((name) => names.has(name))
    && declarations.some((declaration) => shape.declarations.has(declaration))) ? 'box' : 'value'
}

function attribute(ts, file, start) {
  let node = ts.getTokenAtPosition(file, start)
  while (node && !ts.isJsxAttribute(node)) node = node.parent
  if (!node || !node.initializer || !ts.isJsxExpression(node.initializer)) return null
  const expression = node.initializer.expression
  const opening = node.parent.parent
  if (!expression || !opening.tagName || start > expression.getStart(file)) return null
  return { expression, tag: opening.tagName }
}

// Scalar aliases and synthesized boxes stay opaque; no complete contract is proven there.
function originatingBox(ts, expression) {
  while (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression)
    || ts.isTypeAssertionExpression(expression) || ts.isNonNullExpression(expression)
    || ts.isSatisfiesExpression(expression)) expression = expression.expression
  if (ts.isPropertyAccessExpression(expression) && expression.name.text === 'value')
    return expression.expression
  if (ts.isElementAccessExpression(expression)
    && expression.argumentExpression && ts.isStringLiteralLike(expression.argumentExpression)
    && expression.argumentExpression.text === 'value') return expression.expression
  return null
}

/** A core diagnostic only when changing box/value direction explains the type error. */
function boxMismatch(ts, program, diagnostic) {
  if (!assignmentCodes.has(diagnostic.code) || !diagnostic.file || diagnostic.start === undefined)
    return null
  const site = attribute(ts, diagnostic.file, diagnostic.start)
  if (!site) return null
  const checker = program.getTypeChecker()
  const tag = checker.getTypeAtLocation(site.tag)
  if (!tag.getCallSignatures().length && !tag.getConstructSignatures().length) return null
  const actual = checker.getTypeAtLocation(site.expression)
  const expected = checker.getContextualType(site.expression)
  const members = coreMembers(ts, program, checker)
  const given = boxKind(ts, checker, actual, members)
  const wanted = boxKind(ts, checker, expected, members)
  if (!given || !wanted || given === wanted || checker.isTypeAssignableTo(actual, expected))
    return null
  const box = checker.getNonNullableType(given === 'box' ? actual : expected)
  const value = checker.getTypeOfPropertyOfType(box, 'value')
  if (!known(ts, value)) return null
  const from = given === 'box' ? value : actual
  const to = given === 'box' ? expected : value
  if (!checker.isTypeAssignableTo(from, to))
    return null
  if (given === 'value') {
    const origin = originatingBox(ts, site.expression)
    const original = origin && checker.getTypeAtLocation(origin)
    if (boxKind(ts, checker, original, members) !== 'box'
      || !checker.isTypeAssignableTo(original, expected)) return null
  }
  const text = site.expression.getText(diagnostic.file)
  return {
    code: 'W008',
    severity: 'error',
    why: given === 'box'
      ? `This component prop expects a value, but \`${text}\` is a core box.`
      : `This component prop expects a core box, but \`${text}\` is a value.`,
    help: given === 'box'
      ? `Read the box's \`.value\` before passing it to this prop; handle null or undefined first if needed.`
      : 'Pass the State/Derived box itself, for example `count` instead of `count.value`.',
  }
}

/** Keep native inference; lazily use the existing JS host for symbol-backed error mapping. */
function withBoxProps(host, createFallback) {
  let fallback
  return {
    ...host,
    update(files, touched = []) {
      host.update(files, touched)
      fallback?.update(files, touched)
    },
    diagnostics(file) {
      const list = host.diagnostics(file)
      if (!file.endsWith('.tsx') || !list.some((diagnostic) => assignmentCodes.has(diagnostic.code)))
        return list
      fallback ??= createFallback()
      const mapped = fallback.diagnostics(file).filter((diagnostic) => diagnostic.weft)
      return list.map((diagnostic) => {
        if (!assignmentCodes.has(diagnostic.code)) return diagnostic
        const match = mapped.find((candidate) => candidate.start === diagnostic.start)
        return match ? { ...diagnostic, weft: match.weft } : diagnostic
      })
    },
    close() {
      host.close()
      fallback?.close()
    },
  }
}

module.exports = { boxMismatch, withBoxProps }
