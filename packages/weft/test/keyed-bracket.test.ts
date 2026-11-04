// Bracket forms count as mentions, or a page using only them has no such method. This file has to stay free of the
// dotted forms: one of those anywhere here would bring @weft-js/core/keyed in and hide a failure.
import { state } from '@weft-js/core'

test('a page that only uses the bracket form gets @weft-js/core/keyed', () => {
  const box = state({ a: 1 })
  expect(box['get']('a')).toBe(1)
  box[`set`]((d) => {
    d.a = 2
  })
  expect(box.value).toEqual({ a: 2 })
  expect(state['linked'](() => 3).value).toBe(3)
})
