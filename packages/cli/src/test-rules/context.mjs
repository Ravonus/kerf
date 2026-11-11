import { readFileSync } from 'node:fs'
import { dirname, relative } from 'node:path'
import ts from 'typescript'
import { local } from '../alias.mjs'
import {
  assertingFunctions,
  contains,
  moduleKey,
  parse,
  resolveImport,
  rootName,
  unwrap,
  walk,
} from './syntax.mjs'

export function importsOf(sf, abs) {
  const imports = new Map() // local name → { spec, name, abs }
  const namespaces = new Map() // `import * as x` → spec
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !st.importClause || !ts.isStringLiteral(st.moduleSpecifier))
      continue
    const spec = st.moduleSpecifier.text
    const target = resolveImport(abs, spec)
    if (st.importClause.name)
      imports.set(st.importClause.name.text, { spec, name: 'default', abs: target })
    const nb = st.importClause.namedBindings
    if (nb && ts.isNamespaceImport(nb)) namespaces.set(nb.name.text, { spec, abs: target })
    if (nb && ts.isNamedImports(nb))
      for (const el of nb.elements)
        imports.set(el.name.text, { spec, name: (el.propertyName ?? el.name).text, abs: target })
  }
  const helperAsserting = new Set()
  const helperCache = new Map()
  for (const [binding, imp] of imports) {
    if (!imp.abs || /\.(test|spec)\./.test(imp.abs)) continue
    if (!helperCache.has(imp.abs)) {
      let names = new Set()
      try {
        const src = readFileSync(imp.abs, 'utf8')
        names = assertingFunctions(parse(src, imp.abs))
      } catch {}
      helperCache.set(imp.abs, names)
    }
    if (helperCache.get(imp.abs).has(imp.name)) helperAsserting.add(binding)
  }
  return { imports, namespaces, helperAsserting }
}

export function unitsOf(sf, abs, imports) {
  const renders = new Set()
  walk(sf, (n) => {
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === 'render' &&
      n.arguments[0]
    ) {
      const first = unwrap(n.arguments[0])
      if (ts.isIdentifier(first)) renders.add(first.text)
      walk(first, (j) => {
        if (
          (ts.isJsxOpeningElement(j) || ts.isJsxSelfClosingElement(j)) &&
          ts.isIdentifier(j.tagName)
        )
          renders.add(j.tagName.text)
      })
    }
  })
  const isComponentTest = contains(
    sf,
    (n) =>
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      ['render', 'mount', 'hydrate'].includes(n.expression.text),
  )
  const units = new Set()
  const unitSpecs = new Set()
  const specKey = (spec) => spec.replace(/(\/index)?\.[cm]?[jt]sx?$/, '')
  for (const name of renders) {
    const imp = imports.get(name)
    if (imp?.abs) units.add(moduleKey(imp.abs))
    if (imp && local(abs, imp.spec)) unitSpecs.add(specKey(imp.spec))
  }
  const own = resolveImport(
    abs,
    `./${relative(dirname(abs), abs).replace(/\.(test|spec)\.[cm]?[jt]sx?$/, '')}`,
  )
  if (own) units.add(moduleKey(own))
  const isUnitSpec = (spec) => {
    const t = resolveImport(abs, spec)
    return t ? units.has(moduleKey(t)) : unitSpecs.has(specKey(spec))
  }
  const isKerfSpec = (spec) =>
    spec === '@kerf-js/core' || spec.startsWith('@kerf-js/core/') || spec.startsWith('@kerf-js/')
  return { isComponentTest, isUnitSpec, isKerfSpec }
}

export function contextOf(sf, abs) {
  const { imports, namespaces, helperAsserting } = importsOf(sf, abs)
  const asserting = assertingFunctions(sf, helperAsserting)
  const { isComponentTest, isUnitSpec, isKerfSpec } = unitsOf(sf, abs, imports)
  const fakeTimers = contains(
    sf,
    (n) =>
      ts.isPropertyAccessExpression(n) &&
      (n.name.text === 'useFakeTimers' || (n.name.text === 'install' && rootName(n) === 'clock')),
  )
  return { imports, namespaces, asserting, isComponentTest, isUnitSpec, isKerfSpec, fakeTimers }
}
