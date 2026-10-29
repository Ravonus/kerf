// Test cases in a test file, and what changed between two versions of one: which tests are new or edited (the ones
// the gate must prove), and T020, an existing test deleted, skipped or loosened without a written reason.
//
//   // weft-allow T020: the old assertion pinned the bug this change fixes

import ts from 'typescript'
import { diagnostic, positions } from './diag.mjs'
import { allowances, isSubject, matcherOf, norm, parse, testCall } from './tests.mjs'

const skipMods = new Set(['skip', 'todo'])
const skipRoots = new Set(['xit', 'xtest', 'xdescribe'])

/** A case's name as vitest reports it: suite titles and the test title joined by ' > '. */
const join = names => names.join(' > ')

function nameOf(arg) {
  if (!arg) return { name: '<anonymous>', dynamic: true }
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) return { name: arg.text, dynamic: false }
  return { name: arg.getText(), dynamic: true }
}

/**
 * Every test case in one file, in order.
 * @returns {{ name: string, line: number, end: number, body: string, skipped: boolean, fails: boolean, dynamic: boolean, asserts: { key: string, subject: string, matcher: string, not: boolean, args: string, line: number }[], expected: number | null }[]}
 */
export function testCases(text, rel) {
  const sf = parse(text, rel)
  const pos = positions(text)
  const out = []
  const visit = (node, suites, skipped, dynamic) => {
    if (ts.isCallExpression(node)) {
      const t = testCall(node)
      if (t) {
        const each = t.mods.some(m => m.name === 'each' || m.name === 'for')
        const { name, dynamic: dyn } = nameOf(node.arguments[0])
        const skip = skipped || skipRoots.has(t.root) || t.mods.some(m => skipMods.has(m.name))
        const isDynamic = dynamic || dyn || each
        if (t.suite) {
          if (t.fn?.body) ts.forEachChild(t.fn.body, c => visit(c, [...suites, name], skip, isDynamic))
          return
        }
        const asserts = []
        let expected = null
        if (t.fn?.body)
          walk(t.fn.body, n => {
            if (!ts.isCallExpression(n)) return
            if (isSubject(n)) {
              const m = matcherOf(n)
              if (!m) return
              const subject = n.arguments[0] ? norm(n.arguments[0]) : ''
              const args = m.call.arguments.map(norm).join(', ')
              asserts.push({ key: `${subject}|${m.not ? 'not.' : ''}${m.name}|${args}`, subject, matcher: m.name, not: m.not, args, line: pos.lineCol(n.getStart(sf))[0] })
            } else if (ts.isPropertyAccessExpression(n.expression) && ts.isIdentifier(n.expression.expression) && n.expression.expression.text === 'expect' && n.expression.name.text === 'assertions') {
              expected = Number(n.arguments[0]?.getText()) || null
            }
          })
        out.push({
          name: join([...suites, name]), line: pos.lineCol(node.getStart(sf))[0], end: pos.lineCol(node.getEnd())[0], body: t.fn?.body ? norm(t.fn.body) : '',
          skipped: skip, fails: t.mods.some(m => m.name === 'fails'), dynamic: isDynamic, asserts, expected,
        })
        return
      }
    }
    ts.forEachChild(node, c => visit(c, suites, skipped, dynamic))
  }
  visit(sf, [], false, false)
  return out
}

function walk(node, fn) {
  const go = n => { fn(n); ts.forEachChild(n, go) }
  go(node)
}

/** The test names in `after` that are new or whose body changed since `before` (null: the file is new). */
export function changedCases(before, after, rel) {
  const old = new Map((before == null ? [] : testCases(before, rel)).map(c => [c.name, c]))
  return testCases(after, rel).filter(c => !c.skipped && old.get(c.name)?.body !== c.body)
}

/**
 * Loosening a matcher: the new one accepts everything the old one did, and more. Keyed by the old matcher.
 * Changing an expected value (`toBe(3)` → `toBe(4)`) is not loosening: a fix often has to.
 */
const looser = {
  toBe: ['toBeTruthy', 'toBeFalsy', 'toBeDefined', 'toEqual', 'toBeTypeOf', 'toBeInstanceOf'],
  toEqual: ['toBeTruthy', 'toBeDefined', 'toMatchObject', 'toBeTypeOf', 'toBeInstanceOf'],
  toStrictEqual: ['toEqual', 'toBeTruthy', 'toBeDefined', 'toMatchObject'],
  toHaveLength: ['toBeTruthy', 'toBeDefined'],
  toHaveBeenCalledWith: ['toHaveBeenCalled'],
  toHaveBeenCalledTimes: ['toHaveBeenCalled'],
  toHaveBeenLastCalledWith: ['toHaveBeenCalled'],
  toContain: ['toBeTruthy', 'toBeDefined'],
  toMatch: ['toBeTruthy', 'toBeDefined'],
  toThrow: ['toThrow'], // with an argument → without one (checked below)
  toBeNull: ['toBeFalsy'],
  toBeUndefined: ['toBeFalsy'],
  toBeGreaterThan: ['toBeGreaterThanOrEqual'],
  toBeLessThan: ['toBeLessThanOrEqual'],
}

function loosened(a, b) {
  if (a.subject !== b.subject || a.not !== b.not) return false
  if (a.matcher === 'toThrow' || a.matcher === 'toThrowError') return b.matcher.startsWith('toThrow') && a.args && !b.args
  return looser[a.matcher]?.includes(b.matcher) ?? false
}

/**
 * T020 for one test file: an existing test deleted, skipped, marked `.fails`, or with an assertion removed or loosened.
 * `after` null: the whole file was deleted (reported on `before`'s path, line 1).
 */
export function weakened(before, after, rel) {
  if (before == null) return []
  const old = testCases(before, rel)
  if (after == null) {
    const live = old.filter(c => !c.skipped)
    return live.length ? [t020(rel, null, 1, `${rel} was deleted with ${live.length} test${live.length > 1 ? 's' : ''} in it (${live.slice(0, 3).map(c => `"${c.name}"`).join(', ')}${live.length > 3 ? ', …' : ''})`)] : []
  }
  const sf = parse(after, rel)
  const allowed = allowances(after, sf)
  const now = testCases(after, rel)
  const byName = new Map(now.map(c => [c.name, c]))
  const byBody = new Set(now.map(c => c.body))
  const out = []
  const report = (line, why) => { if (!allowed('T020', line)) out.push(t020(rel, after, line, why)) }
  for (const o of old) {
    if (o.skipped || o.dynamic) continue
    const n = byName.get(o.name)
    if (!n) {
      if (!byBody.has(o.body)) report(1, `test "${o.name}" was deleted`)
      continue
    }
    if (n.skipped) { report(n.line, `test "${o.name}" is now skipped`); continue }
    if (n.fails && !o.fails) { report(n.line, `test "${o.name}" is now marked \`.fails\``); continue }
    if (o.expected && (n.expected ?? 0) < o.expected) report(n.line, `test "${o.name}" now expects ${n.expected ?? 'no'} assertions instead of ${o.expected}`)
    const nowKeys = new Set(n.asserts.map(a => a.key))
    const oldKeys = new Set(o.asserts.map(a => a.key))
    const gone = o.asserts.filter(a => !nowKeys.has(a.key))
    const added = n.asserts.filter(a => !oldKeys.has(a.key))
    for (const a of gone) {
      const loose = added.find(b => loosened(a, b))
      if (loose) report(loose.line, `in "${o.name}", \`expect(${a.subject}).${a.not ? 'not.' : ''}${a.matcher}(${a.args})\` became \`${loose.not ? 'not.' : ''}${loose.matcher}(${loose.args})\`, which accepts more`)
    }
    const replaced = gone.filter(a => !added.some(b => loosened(a, b)))
    if (n.asserts.length < o.asserts.length && replaced.length)
      report(n.line, `"${o.name}" lost ${o.asserts.length - n.asserts.length} assertion${o.asserts.length - n.asserts.length > 1 ? 's' : ''}: ${replaced.slice(0, 2).map(a => `\`expect(${a.subject}).${a.matcher}(…)\``).join(', ')}`)
  }
  return out
}

function t020(rel, _text, line, why) {
  const span = [line, 1, line, 1]
  return diagnostic({
    code: 'T020', file: rel, span, why: `${why}. An existing test got weaker, so it may no longer catch what it used to.`,
    help: 'Restore it; or, when the change really is intended (the old test pinned a bug), keep it with `// weft-allow T020: <reason>` on that test, where the reviewer sees it',
  })
}
