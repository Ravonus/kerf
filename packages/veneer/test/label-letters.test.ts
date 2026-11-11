// A label's letters come out the same with and without Intl.Segmenter, which is slow enough to skip for ASCII.
import { labelChars } from '@kerf/veneer-core'
import { letters } from '../src/Field'

test.each(['Email', 'New  todo ', ' A~b ', ''])(
  '%j is what labelChars gives, without making a Segmenter',
  (s) => {
    const made = vi.spyOn(Intl, 'Segmenter')
    expect(letters(s)).toEqual(labelChars(s))
    made.mockClear()
    letters(s)
    expect(made).not.toHaveBeenCalled()
  },
)

test('anything else still goes by grapheme', () => {
  expect(letters('éa')).toEqual(['é', 'a'])
})
