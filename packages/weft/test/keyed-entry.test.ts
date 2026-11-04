// Under the plugin a page gets `box.get`, `box.set` and `state.linked` by mentioning them; the entry alone always has them.
import { state } from '@weft-js/core'

test('this file mentions .get, so it has them', () => {
  const box = state({ a: 1 })
  expect(box.get('a')).toBe(1)
  box.set((d) => {
    d.a = 2
  })
  expect(box.value).toEqual({ a: 2 })
  expect(state.linked(() => 3).value).toBe(3)
})
