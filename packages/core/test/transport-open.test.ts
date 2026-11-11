import { open } from '@kerf-js/core/browser'
import { assertNoLeaks, leaks } from '@kerf-js/core/test'

test('the fake transport shares the browser subscription map', () => {
  const transport = Reflect.get(globalThis, Symbol.for('kerf.net')) as { open: typeof open }
  expect(transport.open).toBe(open)
  const token = {}
  transport.open.set(token, ['test channel', () => transport.open.delete(token)])
  expect(leaks()).toEqual(['test channel'])
  expect(() => assertNoLeaks()).toThrow('T012')
  expect(transport.open.has(token)).toBe(false)
})
