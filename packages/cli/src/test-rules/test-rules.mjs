import ts from 'typescript'
import { asserts, isSubject, matcherOf, norm, walk } from './syntax.mjs'
import { assertsWhatItSet, conditional } from './rule-helpers.mjs'

const focusRoots = { fit: 'it', fdescribe: 'describe' }
const skipRoots = { xit: 'it', xtest: 'test', xdescribe: 'describe' }

export function focusRule(t, { sf, edit, report }) {
  const focus =
    t.mods.find((m) => m.name === 'only') ??
    (focusRoots[t.root] && { name: 'only', node: t.rootNode })
  const skip =
    t.mods.find((m) => m.name === 'skip') ??
    (skipRoots[t.root] && { name: 'skip', node: t.rootNode })
  for (const m of [focus, skip].filter(Boolean)) {
    const kind = t.suite ? 'suite' : 'test'
    let fix
    if (m.node === t.rootNode) {
      const to = focusRoots[t.root] ?? skipRoots[t.root]
      fix = {
        description: `Rename \`${t.root}\` to \`${to}\``,
        safe: m.name === 'only',
        edits: [edit(m.node.getStart(sf), m.node.getEnd(), to)],
      }
      report(
        'T009',
        m.node,
        `\`${t.root}\` ${m.name === 'only' ? 'focuses this ' + kind + ': every other test in the run is silently skipped' : 'skips this ' + kind + ': it never runs, so it proves nothing'}.`,
        { fix },
      )
    } else {
      const dot = m.node.expression.getEnd()
      fix = {
        description: `Remove \`.${m.name}\``,
        safe: m.name === 'only',
        edits: [edit(dot, m.node.getEnd(), '')],
      }
      report(
        'T009',
        m.node.name,
        m.name === 'only'
          ? `\`.only\` focuses this ${kind}: every other test in the run is silently skipped.`
          : `\`.skip\` turns this ${kind} off: it never runs, so it proves nothing. Fix or delete it; a test that is meant to fail is \`test.fails\`.`,
        { fix },
      )
    }
  }
}

function assertionRule(t, { asserting, report }, n, previouslyNoAssertion) {
  if (n) {
    if (!previouslyNoAssertion)
      report('T001', n, `\`${norm(n)}\` has no matcher, so it asserts nothing.`, {
        help: 'Finish it: `expect(x).toBe(…)`, `.toHaveTextContent(…)`, …',
      })
    return
  }
  const body = t.fn.body
  const noAssertion = !asserts(body, asserting)
  if (noAssertion) {
    const title =
      t.call.arguments[0] && ts.isStringLiteralLike(t.call.arguments[0])
        ? ` "${t.call.arguments[0].text}"`
        : ''
    report(
      'T001',
      t.call.expression,
      `Test${title} makes no assertion: it passes as long as nothing throws.`,
    )
  }

  return noAssertion
}

function conditionalRule(t, ctx, noAssertion) {
  const { report } = ctx
  const body = t.fn.body
  // A looped `expect` is fine next to one that always runs; a conditional one never is.
  const looped = []
  let always = false
  walk(body, (n) => {
    if (!ts.isCallExpression(n) || !isSubject(n)) return
    const m = matcherOf(n)
    if (!m) {
      assertionRule(t, ctx, n, noAssertion)
      return
    }
    let why
    for (let a = n.parent; a && a !== t.fn && !why; a = a.parent) why = conditional(a, n)
    if (!why) always = true
    else if (why.loop) looped.push([m.call, why.text])
    else
      report(
        'T008',
        m.call,
        `This \`expect\` only runs ${why.text}, so the test can pass without checking anything.`,
      )
  })
  if (!always)
    for (const [call, how] of looped)
      report(
        'T008',
        call,
        `Every \`expect\` in this test runs ${how}, so the test can pass without checking anything.`,
      )
}

export function setRule(t, { report }) {
  const body = t.fn.body
  if (ts.isBlock(body)) assertsWhatItSet(body.statements, report)
}

export const testRules = [focusRule, assertionRule, conditionalRule, setRule]

export function runTestRules(t, ctx) {
  testRules[0](t, ctx)
  if (
    t.suite ||
    !t.fn ||
    t.mods.some((m) => ['todo', 'skip'].includes(m.name)) ||
    skipRoots[t.root]
  )
    return
  const noAssertion = testRules[1](t, ctx)
  testRules[2](t, ctx, noAssertion)
  testRules[3](t, ctx)
}
