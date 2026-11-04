// The weft() Vite plugin's feature imports: an app pays for @weft-js/core/persist and @weft-js/core/history only where it uses them.
import weft from '../vite.mjs'

type Hook = {
  name: string
  transform: {
    filter: { id: { include: RegExp; exclude: RegExp }; code: RegExp }
    handler: (code: string, id: string) => { code: string } | undefined
  }
}
const features = (weft() as unknown[] as Hook[]).find((p) => p.name === 'weft:features')!
const { filter, handler } = features.transform
const run = (code: string, id = '/app/src/state/cart.ts') =>
  filter.id.include.test(id) && !filter.id.exclude.test(id) && filter.code.test(code)
    ? (handler(code, id)?.code ?? code)
    : code

test('adds the module for each option a file uses, and nothing otherwise', () => {
  expect(run(`state(0, { persist: 'local' })`)).toMatch(/^import '@weft-js\/core\/persist';/)
  expect(run(`defineState('b', setup, { history: { limit: 10 } })`)).toMatch(
    /^import '@weft-js\/core\/history';/,
  )
  expect(run(`state(0, { history: false })`)).not.toMatch(/weft\/history/) // a box opting out isn't a scope opting in
  expect(run(`state(0)`)).toBe(`state(0)`)
})

test("leaves node_modules and weft's own source alone", () => {
  expect(run(`x = { persist: 1 }`, '/app/node_modules/lib/index.js')).toBe(`x = { persist: 1 }`)
  expect(run(`x = { persist: 1 }`, '/repo/packages/weft/src/scope.ts')).toBe(`x = { persist: 1 }`)
})
