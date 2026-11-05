import { fieldValue } from '../src/form/value'

test('field kinds project repeated restored values without changing raw values', () => {
  const repeated = ['first', 'second']
  expect(fieldValue(repeated, 'text')).toBe('first')
  expect(fieldValue(repeated, 'email')).toBe('first')
  expect(fieldValue(repeated, 'multiple')).toEqual(repeated)
  expect(fieldValue('one', 'multiple')).toEqual(['one'])
  expect(fieldValue(undefined, 'multiple')).toBeUndefined()
  expect(fieldValue(repeated)).toBe(repeated)
  expect(fieldValue(repeated, 'raw')).toBe(repeated)
})
