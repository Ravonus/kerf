// @vitest-environment node
// A part belongs to its own component. `[data-scope="dialog"] [data-part="mark"]` once reached the mark of a
// checkbox inside a Modal, and a bare `[data-part="mark"]` in the flows sheet reached every checkbox on the page: the
// tick rendered as a 44px tile outside the box. Every shipped `[data-part]` selector must hang from its own scope:
// as the scope's child, or as a descendant fenced against the other components that have a part of that name.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { guard, loose, partsOf } from '../scripts/split-css/parts.mjs'
import { partContext } from '../scripts/split-css.mjs'

const styles = join(__dirname, '../styles')
const sheets = readdirSync(styles, { recursive: true, encoding: 'utf8' }).filter((f) =>
  f.endsWith('.css'),
)
const ctx = partContext()

// The signature's shared parts: the same thing in every component that has one (the sweep border, the rail, the
// shuttle, the label's letters), so one rule for all of them is the point. Anything else bare is a leak.
const PRIMITIVES = new Set([
  'sweep',
  'sweep-base',
  'sweep-fill',
  'sweep-outline',
  'sweep-label',
  'sweep-content',
  'sweep-corners',
  'frame-corners',
  'corners',
  'rail',
  'rail-fill',
  'rail-hover',
  'track',
  'thumb',
  'shuttle',
  'label-chars',
  'label-text',
  'shimmer',
  'skeleton',
  'spinner',
  'spin',
  'sr-only',
  'eyebrow',
  'close',
  'head',
  'spacer',
  'spark',
])

// Parts whose rule names the part alone: a name only one thing uses, usually a spec pattern an app writes by hand
// with no component root around it (a Prejoin countdown, a payment provider tile, a phone field's country button).
// A bare rule is safe only while the name stays unique, so each one must have no owner anywhere else: the day a
// component gives one of its parts this name, the test below fails and the rule takes a scope.
const STANDALONE = new Set([
  'app-bar',
  'app-title',
  'beacon',
  'caret-anchor',
  'carrier',
  'code-label',
  'codes',
  'confirm-field',
  'copy-note',
  'countdown',
  'country',
  'diagram',
  'hit',
  'literal',
  'live',
  'org',
  'pop-head',
  'provider',
  'range-sep',
  'sync',
  'tool-frame',
  'version',
  'view-toggle',
])
const sheetText = sheets.map((f) => readFileSync(join(styles, f), 'utf8'))

test('no shipped [data-part] selector can reach into a nested component', () => {
  // every part hangs from a scope: in the same compound, as a child chain, or as a fenced descendant. A bare part
  // (or one "scoped" by exclusion, `[data-part="mark"]:not([data-scope="meter"] *)`, which matches every other
  // component's mark on the page) fails, unless it is a signature primitive or a unique standalone name
  const bad = sheets.flatMap((f, i) =>
    loose(sheetText[i]!, ctx, new Set([...PRIMITIVES, ...STANDALONE])).map(
      (b) => `${f}: ${b.how} [${b.parts.join(',')}] ${b.selector.slice(0, 160)}`,
    ),
  )
  expect(bad).toEqual([])
})

test('the fence: a dialog mark rule misses a checkbox mark inside it, and still reaches a nested dialog', () => {
  const css = ':where([data-scope="dialog"] [data-part="mark"]) { inline-size: 36px }'
  const out = guard(css, ctx)
  expect(out).toContain('[data-scope="checkbox"]')
  const [f] = partsOf(out.slice(0, out.indexOf('{')))
  expect(f?.fenced).toBe(true)
  expect(loose(out, ctx)).toEqual([])
  expect(loose(css, ctx).map((b) => b.how)).toEqual(['descendant'])
})

test('a standalone part is unique: no component owns a part of that name, and the entry is still used', () => {
  const taken = [...STANDALONE]
    .filter((p) => ctx.owners.get(p)?.size)
    .map((p) => `${p}: ${[...ctx.owners.get(p)!].join(',')}`)
  expect(taken).toEqual([])
  const unused = [...STANDALONE].filter(
    (p) => !sheetText.some((css) => css.includes(`[data-part="${p}"]`)),
  )
  expect(unused).toEqual([])
})

test('a bare part is caught, a primitive is not', () => {
  expect(loose(':where([data-part="mark"]) { display: grid }', ctx).length).toBe(1)
  // scoping by exclusion is no scope: this was flows' result mark, and it matched every checkbox tick
  expect(
    loose(':where([data-part="mark"]:not([data-scope="meter"] *)) { inline-size: 44px }', ctx)
      .length,
  ).toBe(1)
  // a part unique today is still caught unless it is listed: uniqueness is checked, not assumed
  expect(loose(':where([data-part="result-mark"]) { inline-size: 44px }', ctx).length).toBe(1)
  expect(loose(':where([data-part="sweep"]) { inset: 0 }', ctx, PRIMITIVES)).toEqual([])
  // child chains hang from their scope and need no fence
  expect(
    loose(
      ':where([data-scope="checkbox"] > [data-part="control"] > [data-part="mark"]) { x: y }',
      ctx,
    ),
  ).toEqual([])
})

test('a component may style the parts of the components it is built from', () => {
  // SideNav renders a NavList and styles its rows; an app's NavList elsewhere is not the SideNav's business
  expect(ctx.composes.sidenav?.has('navlist')).toBe(true)
  expect(ctx.composes.dialog?.has('checkbox') ?? false).toBe(false)
})
