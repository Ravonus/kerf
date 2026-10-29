// Static T-codes for test files (PLAN §7b, research 05 §5.1): tests that can't be junk.
//
//   T001 no assertion          T004 sleeps / real timers     T007 unapproved snapshot
//   T002 tautology             T005 implementation queries   T008 conditional or looped `expect`
//   T003 asserts what it set   T006 mocks weft or the unit   T009 `.only` / `.skip`
//
// Syntax only (TypeScript's parser, no type checker), like the project view. `weft/test` adds a runtime T001 for
// assertions this pass can't see. A finding a test needs on purpose is kept with a written reason:
//
//   // weft-allow T004, T005: hydration tests read the server DOM and wait for real timers
//
// in the file's leading comments covers the whole file; anywhere else it covers its own line and the next one.
// Without a reason it is ignored.

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import ts from 'typescript'
import { diagnostic, positions } from './diag.mjs'

export const testGlobs = ['**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}']

const suiteRoots = new Set(['describe', 'suite', 'fdescribe', 'xdescribe'])
const testRoots = new Set(['test', 'it', 'fit', 'xit', 'xtest', ...suiteRoots])
const focusRoots = { fit: 'it', fdescribe: 'describe' }
const skipRoots = { xit: 'it', xtest: 'test', xdescribe: 'describe' }
const snapshotMatchers = new Set(['toMatchSnapshot', 'toMatchInlineSnapshot', 'toMatchFileSnapshot', 'toThrowErrorMatchingSnapshot', 'toThrowErrorMatchingInlineSnapshot'])
const sameValueMatchers = new Set(['toBe', 'toEqual', 'toStrictEqual'])
const domQueries = new Set(['querySelector', 'querySelectorAll', 'getElementsByClassName', 'getElementsByTagName', 'getElementById', 'closest'])
const loopCallbacks = new Set(['forEach', 'map', 'flatMap', 'filter', 'some', 'every', 'find', 'findIndex', 'reduce'])
const timerCalls = new Set(['setTimeout', 'setInterval', 'requestAnimationFrame', 'setImmediate'])
const exts = ['', '.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs', '/index.ts', '/index.tsx', '/index.js']

const kindOf = file => (/\.tsx$/.test(file) ? ts.ScriptKind.TSX : /\.jsx$/.test(file) ? ts.ScriptKind.JSX : /\.[mc]?ts$/.test(file) ? ts.ScriptKind.TS : ts.ScriptKind.JS)
const parse = (text, file) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kindOf(file))
const isFn = n => n && (ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n))
const norm = n => n.getText().replace(/\s+/g, ' ').replace(/;$/, '')
const unwrap = n => {
  while (n && (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n) || ts.isAwaitExpression(n))) n = n.expression
  return n
}

function walk(node, visit) {
  const go = n => {
    if (visit(n) === false) return
    ts.forEachChild(n, go)
  }
  go(node)
}

const contains = (node, pred) => {
  let hit = false
  walk(node, n => {
    if (hit) return false
    if (pred(n)) hit = true
  })
  return hit
}

/** The identifier at the root of `a.b(…).c`, or undefined. */
function rootName(expr) {
  let n = expr
  for (;;) {
    n = unwrap(n)
    if (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n) || ts.isCallExpression(n)) n = n.expression
    else break
  }
  return ts.isIdentifier(n) ? n.text : undefined
}

/** `1`, `'a'`, `null`, `[1, { a: 'b' }]`: a value with nothing behind it. */
function isLiteral(n) {
  n = unwrap(n)
  if (!n) return false
  if (ts.isStringLiteral(n) || ts.isNumericLiteral(n) || ts.isBigIntLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isRegularExpressionLiteral(n)) return true
  if ([ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(n.kind)) return true
  if (ts.isIdentifier(n)) return n.text === 'undefined' || n.text === 'NaN' || n.text === 'Infinity'
  if (ts.isPrefixUnaryExpression(n)) return isLiteral(n.operand)
  if (ts.isArrayLiteralExpression(n)) return n.elements.every(isLiteral)
  if (ts.isObjectLiteralExpression(n)) return n.properties.every(p => ts.isPropertyAssignment(p) && isLiteral(p.initializer))
  return false
}

const hasCall = n => contains(n, x => ts.isCallExpression(x) || ts.isNewExpression(x) || ts.isAwaitExpression(x) || ts.isTaggedTemplateExpression(x))

/** `expect(x)`, `expect.soft(x)`, `t.expect(x)`: the call that takes the subject. */
function isSubject(call) {
  const c = call.expression
  if (ts.isIdentifier(c)) return c.text === 'expect'
  if (!ts.isPropertyAccessExpression(c)) return false
  if (c.name.text === 'expect') return true
  return ts.isIdentifier(c.expression) && c.expression.text === 'expect' && ['soft', 'poll'].includes(c.name.text)
}

/** For a subject call, the matcher it ends in: `expect(x).not.toBe(1)` → { name: 'toBe', call, not: true }. */
function matcherOf(subject) {
  let cur = subject
  let not = false
  const mods = []
  for (;;) {
    const p = cur.parent
    if (p && ts.isPropertyAccessExpression(p) && p.expression === cur) {
      const name = p.name.text
      if (p.parent && ts.isCallExpression(p.parent) && p.parent.expression === p) return { name, node: p.name, call: p.parent, not, mods }
      if (name === 'not') not = !not
      mods.push(name)
      cur = p
    } else return null
  }
}

/** Test and suite calls, with their modifiers: `test.only.each(table)('x', fn)`. */
function testCall(call) {
  // The outer call of a curried form (`test.each(t)(…)`) is the test; skip the inner one.
  if (call.parent && ts.isCallExpression(call.parent) && call.parent.expression === call) return null
  const mods = []
  let n = call.expression
  for (;;) {
    if (ts.isPropertyAccessExpression(n)) {
      mods.unshift({ name: n.name.text, node: n })
      n = n.expression
    } else if (ts.isCallExpression(n)) n = n.expression
    else break
  }
  if (!ts.isIdentifier(n) || !testRoots.has(n.text)) return null
  const root = n.text
  const fn = [...call.arguments].reverse().find(a => ts.isArrowFunction(a) || ts.isFunctionExpression(a))
  return { root, rootNode: n, mods, fn, suite: suiteRoots.has(root), call }
}

/** Functions (by name) whose bodies assert, in one file: local helpers and, given `imported`, what they call. */
function assertingFunctions(sf, imported = new Set()) {
  const bodies = new Map()
  const add = (name, fn) => fn?.body && bodies.set(name, fn.body)
  for (const st of sf.statements) {
    const decl = ts.isExportDeclaration(st) ? null : st
    if (decl && ts.isFunctionDeclaration(decl) && decl.name) add(decl.name.text, decl)
    if (decl && ts.isVariableStatement(decl))
      for (const d of decl.declarationList.declarations) if (ts.isIdentifier(d.name) && isFn(d.initializer)) add(d.name.text, d.initializer)
  }
  const asserting = new Set(imported)
  for (let changed = true; changed; ) {
    changed = false
    for (const [name, body] of bodies) {
      if (asserting.has(name) || !asserts(body, asserting)) continue
      asserting.add(name)
      changed = true
    }
  }
  return asserting
}

/** Does this code assert? A matcher, `assert…`, `expect.assertions`, a helper named `expect…`, or a known asserting function. */
function asserts(node, asserting) {
  return contains(node, n => {
    if (!ts.isCallExpression(n)) return false
    if (isSubject(n)) return Boolean(matcherOf(n))
    const c = n.expression
    if (ts.isPropertyAccessExpression(c) && ts.isIdentifier(c.expression) && c.expression.text === 'expect') return true // expect.assertions(n)
    const name = ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) && ts.isIdentifier(c.expression) ? c.expression.text : undefined
    return Boolean(name && (/^(expect|assert)([A-Z_]|$)/.test(name) || asserting.has(name)))
  })
}

function resolveImport(fromAbs, spec) {
  if (!spec.startsWith('.')) return null
  for (const e of exts) {
    const p = join(dirname(fromAbs), spec + e)
    if (existsSync(p) && !p.endsWith('/') && (e || /\.[cm]?[jt]sx?$/.test(p))) return p
  }
  return null
}

const moduleKey = abs => abs.replace(/(\/index)?\.[cm]?[jt]sx?$/, '')

/** Comment directives: `// weft-allow T004, T005: reason`. */
function allowances(text, sf) {
  const firstCode = sf.statements[0]?.getStart(sf) ?? text.length
  const file = new Set()
  const lines = new Map()
  const pos = positions(text)
  for (const m of text.matchAll(/\/\/[ \t]*weft-allow[ \t]+((?:T\d{3}[ \t,]*)+)(?::[ \t]*(\S.*))?$/gm)) {
    if (!m[2]?.trim()) continue
    const codes = m[1].match(/T\d{3}/g)
    if (m.index < firstCode) for (const c of codes) file.add(c)
    else {
      const [line] = pos.lineCol(m.index)
      for (const l of [line, line + 1]) for (const c of codes) lines.set(`${c}:${l}`, true)
    }
  }
  return (code, line) => file.has(code) || lines.has(`${code}:${line}`)
}

/**
 * T-codes for one test file.
 * @param {string} text
 * @param {string} rel path relative to the project root (for diagnostics)
 * @param {{ abs?: string, root?: string }} [options] `abs` lets T001/T006 read the helpers and units the file imports
 */
export function checkTestFile(text, rel, options = {}) {
  const abs = options.abs ?? rel
  const sf = parse(text, rel)
  const pos = positions(text)
  const allowed = allowances(text, sf)
  const out = []
  const seen = new Set()
  const report = (code, node, why, extra = {}) => {
    const start = node.getStart(sf)
    const end = node.getEnd()
    const span = pos.span(start, end)
    const key = `${code}:${span[0]}:${span[1]}`
    if (allowed(code, span[0]) || seen.has(key)) return
    seen.add(key)
    out.push(diagnostic({ code, file: rel, span, offset: [start, end], why, ...extra }))
  }
  const edit = (start, end, newText) => ({ file: rel, span: pos.span(start, end), offset: [start, end], text: newText })

  // ---- what the file imports -----------------------------------------------------------------------------------
  const imports = new Map() // local name → { spec, name, abs }
  const namespaces = new Map() // `import * as x` → spec
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !st.importClause || !ts.isStringLiteral(st.moduleSpecifier)) continue
    const spec = st.moduleSpecifier.text
    const target = resolveImport(abs, spec)
    if (st.importClause.name) imports.set(st.importClause.name.text, { spec, name: 'default', abs: target })
    const nb = st.importClause.namedBindings
    if (nb && ts.isNamespaceImport(nb)) namespaces.set(nb.name.text, { spec, abs: target })
    if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) imports.set(el.name.text, { spec, name: (el.propertyName ?? el.name).text, abs: target })
  }
  const helperAsserting = new Set()
  const helperCache = new Map()
  for (const [local, imp] of imports) {
    if (!imp.abs || /\.(test|spec)\./.test(imp.abs)) continue
    if (!helperCache.has(imp.abs)) {
      let names = new Set()
      try {
        const src = readFileSync(imp.abs, 'utf8')
        names = assertingFunctions(parse(src, imp.abs))
      } catch {}
      helperCache.set(imp.abs, names)
    }
    if (helperCache.get(imp.abs).has(imp.name)) helperAsserting.add(local)
  }
  const asserting = assertingFunctions(sf, helperAsserting)

  // ---- what the file tests: components it renders, and the modules they come from --------------------------------
  const renders = new Set()
  walk(sf, n => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'render' && n.arguments[0]) {
      const first = unwrap(n.arguments[0])
      if (ts.isIdentifier(first)) renders.add(first.text)
      walk(first, j => {
        if ((ts.isJsxOpeningElement(j) || ts.isJsxSelfClosingElement(j)) && ts.isIdentifier(j.tagName)) renders.add(j.tagName.text)
      })
    }
  })
  const isComponentTest = contains(sf, n => ts.isCallExpression(n) && ts.isIdentifier(n.expression) && ['render', 'mount', 'hydrate'].includes(n.expression.text))
  const units = new Set()
  const unitSpecs = new Set()
  const specKey = spec => spec.replace(/(\/index)?\.[cm]?[jt]sx?$/, '')
  for (const name of renders) {
    const imp = imports.get(name)
    if (imp?.abs) units.add(moduleKey(imp.abs))
    if (imp?.spec.startsWith('.')) unitSpecs.add(specKey(imp.spec))
  }
  const own = resolveImport(abs, `./${relative(dirname(abs), abs).replace(/\.(test|spec)\.[cm]?[jt]sx?$/, '')}`)
  if (own) units.add(moduleKey(own))
  const isUnitSpec = spec => {
    const t = resolveImport(abs, spec)
    return t ? units.has(moduleKey(t)) : unitSpecs.has(specKey(spec))
  }
  const isWeftSpec = spec => spec === 'weft' || spec.startsWith('weft/') || spec.startsWith('@weft/')
  const fakeTimers = contains(sf, n => ts.isPropertyAccessExpression(n) && (n.name.text === 'useFakeTimers' || (n.name.text === 'install' && rootName(n) === 'clock')))

  // ---- per test: T001, T003, T008, T009 ---------------------------------------------------------------------------
  const tests = []
  walk(sf, n => {
    if (!ts.isCallExpression(n)) return
    const t = testCall(n)
    if (t) tests.push(t)
  })

  for (const t of tests) {
    const focus = t.mods.find(m => m.name === 'only') ?? (focusRoots[t.root] && { name: 'only', node: t.rootNode })
    const skip = t.mods.find(m => m.name === 'skip') ?? (skipRoots[t.root] && { name: 'skip', node: t.rootNode })
    for (const m of [focus, skip].filter(Boolean)) {
      const kind = t.suite ? 'suite' : 'test'
      let fix
      if (m.node === t.rootNode) {
        const to = focusRoots[t.root] ?? skipRoots[t.root]
        fix = { description: `Rename \`${t.root}\` to \`${to}\``, safe: m.name === 'only', edits: [edit(m.node.getStart(sf), m.node.getEnd(), to)] }
        report('T009', m.node, `\`${t.root}\` ${m.name === 'only' ? 'focuses this ' + kind + ': every other test in the run is silently skipped' : 'skips this ' + kind + ': it never runs, so it proves nothing'}.`, { fix })
      } else {
        const dot = m.node.expression.getEnd()
        fix = { description: `Remove \`.${m.name}\``, safe: m.name === 'only', edits: [edit(dot, m.node.getEnd(), '')] }
        report('T009', m.node.name, m.name === 'only'
          ? `\`.only\` focuses this ${kind}: every other test in the run is silently skipped.`
          : `\`.skip\` turns this ${kind} off: it never runs, so it proves nothing. Fix or delete it; a test that is meant to fail is \`test.fails\`.`, { fix })
      }
    }
    if (t.suite || !t.fn || t.mods.some(m => ['todo', 'skip'].includes(m.name)) || skipRoots[t.root]) continue
    const body = t.fn.body

    const noAssertion = !asserts(body, asserting)
    if (noAssertion) {
      const title = t.call.arguments[0] && ts.isStringLiteralLike(t.call.arguments[0]) ? ` "${t.call.arguments[0].text}"` : ''
      report('T001', t.call.expression, `Test${title} makes no assertion: it passes as long as nothing throws.`)
    }

    // A looped `expect` is fine next to one that always runs; a conditional one never is.
    const looped = []
    let always = false
    walk(body, n => {
      if (!ts.isCallExpression(n) || !isSubject(n)) return
      const m = matcherOf(n)
      if (!m) {
        if (!noAssertion) report('T001', n, `\`${norm(n)}\` has no matcher, so it asserts nothing.`, { help: 'Finish it: `expect(x).toBe(…)`, `.toHaveTextContent(…)`, …' })
        return
      }
      let why
      for (let a = n.parent; a && a !== t.fn && !why; a = a.parent) why = conditional(a, n)
      if (!why) always = true
      else if (why.loop) looped.push([m.call, why.text])
      else report('T008', m.call, `This \`expect\` only runs ${why.text}, so the test can pass without checking anything.`)
    })
    if (!always) for (const [call, text] of looped) report('T008', call, `Every \`expect\` in this test runs ${text}, so the test can pass without checking anything.`)

    if (ts.isBlock(body)) assertsWhatItSet(body.statements, report)
  }

  // ---- whole file: T002, T004, T005, T006, T007 ---------------------------------------------------------------------
  const renderResults = new Set()
  walk(sf, n => {
    if (ts.isVariableDeclaration(n) && n.initializer && ts.isCallExpression(unwrap(n.initializer)) && rootName(unwrap(n.initializer).expression) === 'render') {
      if (ts.isIdentifier(n.name)) renderResults.add(n.name.text)
      if (ts.isObjectBindingPattern(n.name))
        for (const el of n.name.elements) if ((el.propertyName ?? el.name).getText() === 'container') report('T005', el, '`container` reaches into the DOM tree the user never sees.')
    }
  })

  walk(sf, n => {
    if (ts.isCallExpression(n)) {
      const c = n.expression
      const name = ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : undefined

      if (isSubject(n)) {
        const m = matcherOf(n)
        const subject = n.arguments[0]
        if (m && subject) {
          if (isLiteral(subject)) report('T002', n, `\`${norm(n)}\` checks a literal, so it can never fail.`)
          else if (sameValueMatchers.has(m.name) && !m.not && m.call.arguments[0] && norm(m.call.arguments[0]) === norm(subject) && !hasCall(subject))
            report('T002', m.call, `\`${norm(m.call)}\` compares \`${norm(subject)}\` with itself, so it can never fail.`)
          else if (ts.isBinaryExpression(unwrap(subject)) && isComparison(unwrap(subject)) && norm(unwrap(subject).left) === norm(unwrap(subject).right) && !hasCall(subject))
            report('T002', n, `\`${norm(subject)}\` compares a value with itself, so it can never fail.`)
          if (snapshotMatchers.has(m.name))
            report('T007', m.node, `\`${m.name}\` records whatever the code does today and passes against it: it pins output, not behavior.`)
          if (m.name === 'toHaveClass') report('T005', m.node, '`toHaveClass` asserts on styling classes, not on what the user sees.')
          if (contains(subject, x => ts.isPropertyAccessExpression(x) && ['className', 'classList', 'innerHTML', 'outerHTML'].includes(x.name.text))) {
            const prop = []
            walk(subject, x => { if (ts.isPropertyAccessExpression(x) && ['className', 'classList', 'innerHTML', 'outerHTML'].includes(x.name.text)) prop.push(x.name.text) })
            report('T005', subject, `Asserting on \`${prop[0]}\` pins markup and classes, not what the user sees.`)
          }
          if (isComponentTest && readsInternalState(subject, imports)) report('T005', subject, `\`${norm(subject)}\` reads the component's state directly instead of what it renders.`)
        }
      }

      if (name && domQueries.has(name) && ts.isPropertyAccessExpression(c)) report('T005', c.name, `\`${name}\` queries by CSS structure, which users never see.`)
      if (name && /^(get|query|find)(All)?ByTestId$/.test(name)) report('T005', ts.isPropertyAccessExpression(c) ? c.name : c, `\`${name}\` finds the element by a test id the user never sees.`)

      // T004: sleeps, real timers and polling.
      if (name === 'waitFor' || name === 'waitForElementToBeRemoved')
        report('T004', c, `\`${name}\` polls on real timers and guesses how long the update takes.`, { help: '`await user.click(…)` and `await flush()` settle every update; there is nothing to wait for' })
      if (ts.isIdentifier(c) && ['sleep', 'delay'].includes(c.text) && ts.isAwaitExpression(n.parent))
        report('T004', n, `\`${norm(n)}\` sleeps on the real clock: slow, and flaky when the machine is busy.`)
      if (name && timerCalls.has(name) && (ts.isIdentifier(c) || ['window', 'globalThis', 'global'].includes(rootName(c)))) {
        const sleep = sleepPromise(n)
        if (sleep) {
          const delay = n.arguments[1]
          const zero = !delay || (ts.isNumericLiteral(delay) && Number(delay.text) === 0)
          const fix = zero ? flushFix(sf, sleep, edit) : undefined
          report('T004', sleep, `\`${norm(sleep)}\` sleeps on the real clock: slow, and flaky when the machine is busy.`, {
            help: zero ? 'Use `await flush()`: it settles every pending update' : `Install the fake clock (\`clock.install()\`) and use \`await clock.advance(${delay.getText()})\``,
            fix,
          })
        } else if (!fakeTimers && !insideFakeApi(n))
          report('T004', c, `\`${name}\` runs on the real clock in a test.`, { help: 'Call `clock.install()` from weft/test first and drive time with `await clock.advance(ms)`' })
      }

      // T006: mocking weft or the unit under test.
      if (name && ['mock', 'doMock'].includes(name) && ['vi', 'jest'].includes(rootName(c)) && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0])) {
        const spec = n.arguments[0].text
        if (isWeftSpec(spec)) report('T006', n, `Mocking \`${spec}\` replaces the framework the test is supposed to exercise.`)
        else if (isUnitSpec(spec)) report('T006', n, `Mocking \`${spec}\` replaces the unit under test, so the test checks the mock.`)
      }
      if (name === 'spyOn' && ['vi', 'jest'].includes(rootName(c)) && n.arguments[0] && ts.isIdentifier(n.arguments[0])) {
        const ns = namespaces.get(n.arguments[0].text)
        if (ns && isWeftSpec(ns.spec)) report('T006', n, `Spying on \`${ns.spec}\` replaces the framework the test is supposed to exercise.`)
        else if (ns && isUnitSpec(ns.spec)) report('T006', n, `Spying on \`${ns.spec}\` replaces the unit under test, so the test checks the mock.`)
      }
    }

    if (ts.isPropertyAccessExpression(n) && n.name.text === 'container' && !(ts.isCallExpression(n.parent) && n.parent.expression === n)) {
      const obj = unwrap(n.expression)
      const fromRender = (ts.isCallExpression(obj) && rootName(obj.expression) === 'render') || (ts.isIdentifier(obj) && renderResults.has(obj.text))
      if (fromRender) report('T005', n, '`container` reaches into the DOM tree the user never sees.')
    }
  })

  return out
}

const isComparison = b => [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(b.operatorToken.kind)

/** Why `node`, under ancestor `a`, only runs sometimes (`loop`: maybe zero times); undefined when it always runs. */
function conditional(a, node) {
  const within = x => x && node.getStart() >= x.getStart() && node.getEnd() <= x.getEnd()
  const when = text => ({ text })
  const loop = text => ({ text, loop: true })
  if (ts.isIfStatement(a) && !within(a.expression)) return when('when the `if` matches')
  if (ts.isConditionalExpression(a) && !within(a.condition)) return when('on one side of a `?:`')
  if (ts.isBinaryExpression(a) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(a.operatorToken.kind) && within(a.right)) return when(`after a \`${a.operatorToken.getText()}\``)
  if (ts.isCaseClause(a) || ts.isDefaultClause(a)) return when('in one `switch` case')
  if (ts.isCatchClause(a)) return when('when something throws')
  if ((ts.isForStatement(a) || ts.isForOfStatement(a) || ts.isForInStatement(a) || ts.isWhileStatement(a) || ts.isDoStatement(a)) && within(a.statement)) return loop('inside a loop, and zero iterations check nothing')
  if (isFn(a) && ts.isCallExpression(a.parent) && ts.isPropertyAccessExpression(a.parent.expression) && loopCallbacks.has(a.parent.expression.name.text) && a.parent.arguments.includes(a))
    return loop(`inside \`.${a.parent.expression.name.text}\`, and an empty list checks nothing`)
  return undefined
}

/** `expect(cart.items.value)` with `cart` imported from app code, in a component test. (`scope(cart)` from weft/test is the way to test a scope.) */
function readsInternalState(subject, imports) {
  const s = unwrap(subject)
  if (!ts.isPropertyAccessExpression(s) || s.name.text !== 'value') return false
  let n = s.expression
  for (;;) {
    n = unwrap(n)
    if (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) n = n.expression
    else break
  }
  return ts.isIdentifier(n) && imports.get(n.text)?.spec.startsWith('.') && Boolean(imports.get(n.text)?.abs)
}

/** `new Promise(r => setTimeout(r, ms))`: the timer call's enclosing sleep, or undefined. */
function sleepPromise(timer) {
  const cb = timer.arguments[0]
  let exec = timer.parent
  while (exec && (ts.isExpressionStatement(exec) || ts.isBlock(exec))) exec = exec.parent
  if (!isFn(exec) || !ts.isNewExpression(exec.parent) || exec.parent.expression.getText() !== 'Promise') return undefined
  const resolveName = exec.parameters[0]?.name.getText()
  const callsResolve = cb && (cb.getText() === resolveName || (isFn(cb) && contains(cb.body, x => ts.isCallExpression(x) && x.expression.getText() === resolveName)))
  if (!callsResolve) return undefined
  // A fake API's latency resolves with data (`ok(user)`); a sleep resolves with nothing.
  if (isFn(cb) && contains(cb.body, x => ts.isCallExpression(x) && x.expression.getText() === resolveName && x.arguments.length > 0)) return undefined
  return exec.parent
}

/** Timers inside a function that a fake API returns (`load: id => new Promise(ok => setTimeout(() => ok(x), ms))`). */
function insideFakeApi(timer) {
  for (let n = timer.parent; n; n = n.parent) {
    if (ts.isNewExpression(n) && n.expression.getText() === 'Promise') return true
  }
  return false
}

/** Replace a zero-delay sleep with `flush()`, importing it from weft/test when the file doesn't. */
function flushFix(sf, sleep, edit) {
  const edits = [edit(sleep.getStart(sf), sleep.getEnd(), 'flush()')]
  const hasFlush = sf.statements.some(st => ts.isImportDeclaration(st) && st.importClause?.namedBindings && ts.isNamedImports(st.importClause.namedBindings) && st.importClause.namedBindings.elements.some(e => e.name.text === 'flush'))
  if (!hasFlush) {
    const weftTest = sf.statements.find(st => ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier) && st.moduleSpecifier.text === 'weft/test' && st.importClause?.namedBindings && ts.isNamedImports(st.importClause.namedBindings))
    if (weftTest) {
      const el = weftTest.importClause.namedBindings.elements
      edits.push(edit(el[el.length - 1].getEnd(), el[el.length - 1].getEnd(), ', flush'))
    } else {
      const last = [...sf.statements].reverse().find(st => ts.isImportDeclaration(st))
      const at = last ? last.getEnd() : 0
      edits.push(edit(at, at, `${last ? '\n' : ''}import { flush } from 'weft/test'${last ? '' : '\n'}`))
    }
  }
  return { description: 'Replace the sleep with `flush()`', safe: false, edits }
}

/**
 * T003 in one test body: `n.value = 5; expect(n.value).toBe(5)`, or `const s = state(3); expect(s.value).toBe(3)`.
 * Any call between the write and the assertion (a click, a render, a fake push) may route through the app, so it ends
 * the check; `flush()` doesn't.
 */
function assertsWhatItSet(statements, report) {
  const writes = new Map()
  const boxes = new Set() // `const n = state(…)`: a plain box, so a write reads straight back
  const locals = new Set()
  const isFlush = st => {
    const e = ts.isExpressionStatement(st) ? unwrap(st.expression) : null
    return e && ts.isCallExpression(e) && e.expression.getText() === 'flush'
  }
  for (const st of statements) {
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !d.initializer) continue
        const init = unwrap(d.initializer)
        locals.add(d.name.text)
        if (ts.isCallExpression(init) && init.expression.getText() === 'state') boxes.add(d.name.text)
        if (isLiteral(init)) writes.set(d.name.text, init)
        else if (ts.isCallExpression(init) && init.expression.getText() === 'state' && init.arguments[0] && isLiteral(init.arguments[0])) writes.set(`${d.name.text}.value`, init.arguments[0])
        else if (hasCall(init)) writes.clear()
      }
      continue
    }
    if (isFlush(st)) continue
    const e = ts.isExpressionStatement(st) ? unwrap(st.expression) : null
    if (e && ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.EqualsToken && !hasCall(e.left)) {
      const target = norm(e.left)
      const plain = (ts.isIdentifier(e.left) && locals.has(target)) || (ts.isPropertyAccessExpression(e.left) && e.left.name.text === 'value' && boxes.has(norm(e.left.expression)))
      if (isLiteral(e.right) && plain) writes.set(target, e.right)
      else writes.delete(target)
      if (hasCall(e.right)) writes.clear()
      continue
    }
    const subject = e && findSubject(e)
    if (subject) {
      const m = matcherOf(subject)
      const written = subject.arguments[0] && writes.get(norm(subject.arguments[0]))
      if (m && !m.not && sameValueMatchers.has(m.name) && written && m.call.arguments[0] && norm(m.call.arguments[0]) === norm(written))
        report('T003', m.call, `The test set \`${norm(subject.arguments[0])}\` to \`${norm(written)}\` itself and asserts it back: nothing between went through the UI or the graph.`)
      continue
    }
    writes.clear()
  }
}

/** The subject call of a statement that is one assertion chain (`expect(a).toBe(b)`), else undefined. */
function findSubject(e) {
  let n = unwrap(e)
  for (;;) {
    if (ts.isCallExpression(n) && isSubject(n)) return n
    if (ts.isCallExpression(n) || ts.isPropertyAccessExpression(n)) n = unwrap(n.expression)
    else return undefined
  }
}

/**
 * T-codes for the project's test files.
 * @param {string} root absolute project root
 * @param {string[]} rels test files, relative to `root`
 */
export function checkTests(root, rels) {
  return rels.flatMap(rel => {
    const abs = join(root, rel)
    return checkTestFile(readFileSync(abs, 'utf8'), rel, { abs })
  })
}

export const isTestFile = rel => /\.(test|spec)\.[cm]?[jt]sx?$/.test(rel)

/** Which T-codes this pass reports: each catalog example must produce its own code (the T side of `probe()`). */
export function probeTests(catalog) {
  const out = {}
  for (const e of catalog) {
    if (!/^T\d{3}$/.test(e.code) || e.by !== 'cli') continue // T012 is weft/test's runtime check
    const hit = e.example && checkTestFile(e.example, 'probe.test.tsx').find(d => d.code === e.code)
    out[e.code] = { implemented: Boolean(hit), autofix: hit?.fix?.safe === true, suggestion: Boolean(hit?.fix?.edits) && hit.fix.safe !== true }
  }
  return out
}
