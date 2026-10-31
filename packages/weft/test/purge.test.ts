// @vitest-environment node
import { parse, purge, reachable, words } from '../node/purge.mjs'

const has = (...w: string[]) => words([w.join(' ')])
const out = (css: string, ...w: string[]) => purge([css], has(...w))[0]

test('a rule keyed on a value no build file mentions goes; one it mentions stays', () => {
  expect(out('[data-scope=table] a{color:red}[data-scope=knob] a{color:blue}', 'table')).toBe('[data-scope=table] a{color:red}')
})

test('a selector list loses only its dead members', () => {
  expect(out('[data-scope="a"],[data-scope="b"]{color:red}', 'b')).toBe('[data-scope="b"]{color:red}')
})

test(':where lives if any branch does, and :not is no evidence', () => {
  expect(reachable(':where([data-scope="a"],[data-scope="b"]) p', has('b').has)).toBe(true)
  expect(reachable(':where([data-scope="a"],[data-scope="c"]) p', has('b').has)).toBe(false)
  expect(reachable('p:not([data-part="gone"])', has().has)).toBe(true)
})

test('every keyed attribute in a selector has to be reachable', () => {
  expect(out('[data-scope=a] [data-part=b]{color:red}', 'a')).toBe('')
})

test('dials and plain selectors are left alone: an app sets those at run time', () => {
  const css = '[data-theme=dark]{color:red}.x{color:blue}'
  expect(out(css)).toBe(css)
})

test('at-rules empty after pruning go; layer order statements stay', () => {
  expect(out('@layer a,b;@layer a{@media (width>1px){[data-scope=k]{color:red}}}')).toBe('@layer a,b;')
})

test('custom properties go when nothing reads them, including through a chain', () => {
  const css = ':root{--warp-a:1;--warp-b:var(--warp-a);--warp-c:2}p{top:var(--warp-c)}'
  expect(out(css)).toBe(':root{--warp-c:2}p{top:var(--warp-c)}')
})

test('a property the JS reads stays, and so does one not owned by warp', () => {
  expect(out(':root{--warp-a:1;--brand:2}', '--warp-a')).toBe(':root{--warp-a:1;--brand:2}')
})

test('keyframes stay only while something runs them', () => {
  const live = '[data-scope=a]{animation:spin 1s}@keyframes spin{to{top:0}}'
  expect(out(live, 'a')).toBe(live)
  expect(out(live)).toBe('')
})

test('keep and template stems save names built at run time', () => {
  expect(purge(['[data-scope=knob]{color:red}'], words([], ['knob']))[0]).toContain('knob')
  expect(purge(['[data-part=icon-tile]{color:red}'], words(['`icon-${x}`']))[0]).toContain('icon-tile')
})

test('a token or keyframes one sheet defines and another uses stays', () => {
  const sheets = [':root{--warp-a:1}@keyframes spin{to{top:0}}', 'p{top:var(--warp-a);animation:spin 1s}']
  expect(purge(sheets, has())).toEqual(sheets)
})

test('braces and semicolons inside strings and url() do not split a rule', () => {
  const css = 'a[title="}{;"]{background:url(data:image/svg+xml;base64,AAA)}'
  expect(parse(css)).toHaveLength(1)
  expect(out(css)).toBe(css)
})
