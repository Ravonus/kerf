// kerf-allow T005: framework test of compiled helper imports and their shared reactive graph
import { state } from '@kerf-js/core'
import { Box } from '@kerf-js/core/internal'
import { flush, render } from '@kerf-js/core/test'
import { InternalProps } from './fixtures/internal/Props'

test('compiled locals, rest props and children work with the public runtime', async () => {
  const title = state('first')
  expect(title).toBeInstanceOf(Box)
  render(() => (
    <InternalProps amount={1} title={title.value}>
      child
    </InternalProps>
  ))
  const button = document.querySelector('button')!
  expect(button.textContent).toBe('1child')
  button.click()
  await flush()
  expect(button.textContent).toBe('2child')
  title.value = 'next'
  await flush()
  expect(button.title).toBe('next')
  expect(button.textContent).toBe('2child')
})
