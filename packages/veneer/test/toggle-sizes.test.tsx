// The site's example, so a press on it is a press someone can see.
import { sleep as tick } from '../../../scripts/lib/sleep.mjs'
import { fireEvent } from '@testing-library/dom'
import { flush, render } from '@kerf/core/test'
import { ToggleSizes } from '../../../site/src/toolkit/examples/actions'

const settle = async () => {
  await tick()
  await flush()
  await tick()
  await flush()
}

test('the Toggle Sizes example presses and releases', async () => {
  const { container: c } = render(() => <ToggleSizes />)
  await settle()
  const all = [...c.querySelectorAll('button')]
  expect(all.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'true', 'true'])
  fireEvent.click(all[1]!)
  await settle()
  expect(all.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'true'])
  fireEvent.click(all[1]!)
  await settle()
  expect(all[1]!.getAttribute('aria-pressed')).toBe('true')
})
