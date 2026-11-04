// The site's example, so a press on it is a press someone can see.
import { fireEvent } from '@testing-library/dom'
import { flush, render } from '@weft-js/core/test'
import { ToggleSizes } from '../../../site/src/toolkit/examples/actions'

const tick = (ms = 0) =>
  new Promise((r) => {
    setTimeout(r, ms)
  })
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
