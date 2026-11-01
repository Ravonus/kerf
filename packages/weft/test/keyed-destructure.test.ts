// Taking `linked` off `state` counts as a mention. This file has to stay free of the dotted and bracket forms: either one
// would bring weft/keyed in and hide a failure.
import { state } from 'weft'

const { linked } = state

test('a page that only destructures linked gets weft/keyed', () => {
  expect(linked(() => 3).value).toBe(3)
})
