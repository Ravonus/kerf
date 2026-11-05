import ts from 'typescript'
import {
  contains,
  hasCall,
  isLiteral,
  isSubject,
  matcherOf,
  norm,
  rootName,
  unwrap,
  walk,
} from './syntax.mjs'
import {
  flushFix,
  insideFakeApi,
  isComparison,
  readsInternalState,
  sameValueMatchers,
  sleepPromise,
} from './rule-helpers.mjs'

const snapshotMatchers = new Set([
  'toMatchSnapshot',
  'toMatchInlineSnapshot',
  'toMatchFileSnapshot',
  'toThrowErrorMatchingSnapshot',
  'toThrowErrorMatchingInlineSnapshot',
])
const domQueries = new Set([
  'querySelector',
  'querySelectorAll',
  'getElementsByClassName',
  'getElementsByTagName',
  'getElementById',
  'closest',
])
const timerCalls = new Set(['setTimeout', 'setInterval', 'requestAnimationFrame', 'setImmediate'])

export function renderResultsOf(sf, report) {
  const renderResults = new Set()
  walk(sf, (n) => {
    if (
      ts.isVariableDeclaration(n) &&
      n.initializer &&
      ts.isCallExpression(unwrap(n.initializer)) &&
      rootName(unwrap(n.initializer).expression) === 'render'
    ) {
      if (ts.isIdentifier(n.name)) renderResults.add(n.name.text)
      if (ts.isObjectBindingPattern(n.name))
        for (const el of n.name.elements)
          if ((el.propertyName ?? el.name).getText() === 'container')
            report('T005', el, '`container` reaches into the DOM tree the user never sees.')
    }
  })
  return renderResults
}

function subjectRule(n, { report }) {
  if (isSubject(n)) {
    const m = matcherOf(n)
    const subject = n.arguments[0]
    if (m && subject) {
      if (isLiteral(subject))
        report('T002', n, `\`${norm(n)}\` checks a literal, so it can never fail.`)
      else if (
        sameValueMatchers.has(m.name) &&
        !m.not &&
        m.call.arguments[0] &&
        norm(m.call.arguments[0]) === norm(subject) &&
        !hasCall(subject)
      )
        report(
          'T002',
          m.call,
          `\`${norm(m.call)}\` compares \`${norm(subject)}\` with itself, so it can never fail.`,
        )
      else if (
        ts.isBinaryExpression(unwrap(subject)) &&
        isComparison(unwrap(subject)) &&
        norm(unwrap(subject).left) === norm(unwrap(subject).right) &&
        !hasCall(subject)
      )
        report(
          'T002',
          n,
          `\`${norm(subject)}\` compares a value with itself, so it can never fail.`,
        )
    }
  }
}

function snapshotRule(n, { report }) {
  if (!isSubject(n)) return
  const m = matcherOf(n)
  const subject = n.arguments[0]
  if (!m || !subject) return
  if (snapshotMatchers.has(m.name))
    report(
      'T007',
      m.node,
      `\`${m.name}\` records whatever the code does today and passes against it: it pins output, not behavior.`,
    )
}

function subjectDomRule(n, { report, isComponentTest, imports }) {
  if (!isSubject(n)) return
  const m = matcherOf(n)
  const subject = n.arguments[0]
  if (!m || !subject) return
  if (m.name === 'toHaveClass')
    report('T005', m.node, '`toHaveClass` asserts on styling classes, not on what the user sees.')
  if (
    contains(
      subject,
      (x) =>
        ts.isPropertyAccessExpression(x) &&
        ['className', 'classList', 'innerHTML', 'outerHTML'].includes(x.name.text),
    )
  ) {
    const prop = []
    walk(subject, (x) => {
      if (
        ts.isPropertyAccessExpression(x) &&
        ['className', 'classList', 'innerHTML', 'outerHTML'].includes(x.name.text)
      )
        prop.push(x.name.text)
    })
    report(
      'T005',
      subject,
      `Asserting on \`${prop[0]}\` pins markup and classes, not what the user sees.`,
    )
  }
  if (isComponentTest && readsInternalState(subject, imports))
    report(
      'T005',
      subject,
      `\`${norm(subject)}\` reads the component's state directly instead of what it renders.`,
    )
}

function queryRule(n, { report }, c, name) {
  if (name && domQueries.has(name) && ts.isPropertyAccessExpression(c))
    report('T005', c.name, `\`${name}\` queries by CSS structure, which users never see.`)
  if (name && /^(get|query|find)(All)?ByTestId$/.test(name))
    report(
      'T005',
      ts.isPropertyAccessExpression(c) ? c.name : c,
      `\`${name}\` finds the element by a test id the user never sees.`,
    )
}

function timerRule(n, { sf, edit, report, fakeTimers }, c, name) {
  if (name === 'waitFor' || name === 'waitForElementToBeRemoved')
    report('T004', c, `\`${name}\` polls on real timers and guesses how long the update takes.`, {
      help: '`await user.click(…)` and `await flush()` settle every update; there is nothing to wait for',
    })
  if (ts.isIdentifier(c) && ['sleep', 'delay'].includes(c.text) && ts.isAwaitExpression(n.parent))
    report(
      'T004',
      n,
      `\`${norm(n)}\` sleeps on the real clock: slow, and flaky when the machine is busy.`,
    )
  if (
    name &&
    timerCalls.has(name) &&
    (ts.isIdentifier(c) || ['window', 'globalThis', 'global'].includes(rootName(c)))
  ) {
    const sleep = sleepPromise(n)
    if (sleep) {
      const delay = n.arguments[1]
      const zero = !delay || (ts.isNumericLiteral(delay) && Number(delay.text) === 0)
      const fix = zero ? flushFix(sf, sleep, edit) : undefined
      report(
        'T004',
        sleep,
        `\`${norm(sleep)}\` sleeps on the real clock: slow, and flaky when the machine is busy.`,
        {
          help: zero
            ? 'Use `await flush()`: it settles every pending update'
            : `Install the fake clock (\`clock.install()\`) and use \`await clock.advance(${delay.getText()})\``,
          fix,
        },
      )
    } else if (!fakeTimers && !insideFakeApi(n))
      report('T004', c, `\`${name}\` runs on the real clock in a test.`, {
        help: 'Call `clock.install()` from @weft-js/core/test first and drive time with `await clock.advance(ms)`',
      })
  }
}

function mockRule(n, { report, namespaces, isWeftSpec, isUnitSpec }, c, name) {
  if (
    name &&
    ['mock', 'doMock'].includes(name) &&
    ['vi', 'jest'].includes(rootName(c)) &&
    n.arguments[0] &&
    ts.isStringLiteralLike(n.arguments[0])
  ) {
    const spec = n.arguments[0].text
    if (isWeftSpec(spec))
      report(
        'T006',
        n,
        `Mocking \`${spec}\` replaces the framework the test is supposed to exercise.`,
      )
    else if (isUnitSpec(spec))
      report(
        'T006',
        n,
        `Mocking \`${spec}\` replaces the unit under test, so the test checks the mock.`,
      )
  }
  if (
    name === 'spyOn' &&
    ['vi', 'jest'].includes(rootName(c)) &&
    n.arguments[0] &&
    ts.isIdentifier(n.arguments[0])
  ) {
    const ns = namespaces.get(n.arguments[0].text)
    if (ns && isWeftSpec(ns.spec))
      report(
        'T006',
        n,
        `Spying on \`${ns.spec}\` replaces the framework the test is supposed to exercise.`,
      )
    else if (ns && isUnitSpec(ns.spec))
      report(
        'T006',
        n,
        `Spying on \`${ns.spec}\` replaces the unit under test, so the test checks the mock.`,
      )
  }
}

function domRule(n, ctx, c, name) {
  subjectDomRule(n, ctx)
  queryRule(n, ctx, c, name)
}

const callRules = [subjectRule, snapshotRule, domRule, timerRule, mockRule]

function callRule(n, ctx) {
  if (!ts.isCallExpression(n)) return
  const c = n.expression
  const name = ts.isIdentifier(c)
    ? c.text
    : ts.isPropertyAccessExpression(c)
      ? c.name.text
      : undefined
  for (const rule of callRules) rule(n, ctx, c, name)
}

function socketRule(n, { report }) {
  if (
    ts.isNewExpression(n) &&
    ts.isIdentifier(n.expression) &&
    ['WebSocket', 'EventSource'].includes(n.expression.text)
  )
    report('T013', n, `\`new ${n.expression.text}\` opens a real socket in a fast test.`, {
      help: "Render the `.live()` or stream against @weft-js/core/test's fake transport: `await net.push(stream, message)`, `await net.poke('tag')`, `await net.drop()`",
    })
}

function containerRule(n, { report, renderResults }) {
  if (
    ts.isPropertyAccessExpression(n) &&
    n.name.text === 'container' &&
    !(ts.isCallExpression(n.parent) && n.parent.expression === n)
  ) {
    const obj = unwrap(n.expression)
    const fromRender =
      (ts.isCallExpression(obj) && rootName(obj.expression) === 'render') ||
      (ts.isIdentifier(obj) && renderResults.has(obj.text))
    if (fromRender) report('T005', n, '`container` reaches into the DOM tree the user never sees.')
  }
}

export const fileRules = [callRule, socketRule, containerRule]
