// Taking `linked` off `state` counts as a mention. This file has to stay free of the dotted and bracket forms: either one
// would bring @kerf/core/keyed in and hide a failure.
import { state } from '@kerf/core'

// oxlint-disable-next-line typescript/unbound-method -- that spelling is what the plugin has to see, and linked never reads this
const { linked } = state

test('a page that only destructures linked gets @kerf/core/keyed', () => {
  expect(linked(() => 3).value).toBe(3)
})
