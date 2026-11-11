import { pieces } from '@kerf/core/node-purge'
import { firstPaint } from '../src/first-paint'

const css = `@layer a,b;@layer a{:root{--veneer-x:1px;--veneer-y:2px}}@layer b{[data-scope=one]{width:var(--veneer-x)}[data-scope=two]{height:var(--veneer-y)}[data-scope=two]:hover{color:red}}`
const table = pieces([['a.css', css]])
const paintOf = (t = table) => firstPaint(t, ['a.css'])
const one = '<div data-scope="one"></div>',
  two = '<div data-scope="two"></div>'

test('the same HTML gets the same CSS, whether it was rendered or came out of a cache', () => {
  expect(paintOf()(one)).toBe(paintOf()(one))
  expect(paintOf()(one)).toContain('[data-scope=one]')
  expect(paintOf()(one)).not.toContain('[data-scope=two]')
})

test('its braces balance, and a chunk gets only what the response has not sent', () => {
  const paint = paintOf()
  const first = paint(one),
    chunk = paint(one + two),
    again = paint(two)
  for (const c of [first, chunk]) expect(c.split('{').length).toBe(c.split('}').length)
  expect(first).toContain('--veneer-x')
  expect(chunk).toContain('[data-scope=two]')
  expect(chunk).toContain('--veneer-y')
  expect(chunk).not.toContain('--veneer-x')
  expect(again).toBe('')
})

test('responses at the same time share nothing', async () => {
  const render = async (html: string, wait: number) => {
    const paint = paintOf()
    const head = paint('<p></p>')
    await new Promise((r) => {
      setTimeout(r, wait)
    })
    return head + paint(html)
  }
  const [a, b] = await Promise.all([render(one, 5), render(two, 1)])
  expect(a).toContain('[data-scope=one]')
  expect(a).not.toContain('[data-scope=two]')
  expect(b).toContain('[data-scope=two]')
  expect(b).not.toContain('[data-scope=one]')
})

test('the gate goes in once, with its CSS-only timeout, and its reveal never does', () => {
  const paint = paintOf(pieces([['a.css', css + '[data-kerf=styled]{visibility:visible}']]))
  const css1 = paint('<aside data-kerf="styled"></aside>')
  expect(css1).toContain('visibility:hidden')
  expect(css1).toContain('kerf-gate 0s 3s forwards')
  expect(css1).not.toContain('visibility:visible}[')
  expect(paint('<aside data-kerf="styled"></aside>')).toBe('')
})

test("a sheet this page doesn't have adds nothing, whatever the HTML holds: a route's CSS stays on its route", () => {
  const t = pieces([
    ['a.css', css],
    ['route.css', '[data-scope=one]{color:red}'],
  ])
  expect(firstPaint(t, ['a.css'])(one)).not.toContain('color:red')
  expect(firstPaint(t, ['a.css', 'route.css'])(one)).toContain('color:red')
})

test('a tier dial the head sets is in, one it never names is not', () => {
  const t = pieces([
    [
      'a.css',
      ':root{--veneer-z:1}[data-expression=vivid]{--veneer-z:2}[data-expression=quiet]{--veneer-z:3}b{width:var(--veneer-z)}',
    ],
  ])
  const got = firstPaint(
    t,
    ['a.css'],
    "<script>document.documentElement.dataset.expression='vivid'</script>",
  )('<b></b>')
  expect(got).toContain('[data-expression=vivid]')
  expect(got).not.toContain('[data-expression=quiet]')
})
