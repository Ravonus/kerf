import { sleep as tick } from '../../../scripts/lib/sleep.mjs'
import { state } from '@kerf-js/core'
import { flush, render } from '@kerf-js/core/test'
import { KeyValueEditor } from '../src/KeyValueEditor'

const input = (root: HTMLElement, index: number) =>
  root.querySelectorAll<HTMLInputElement>('tbody input')[index]!
const change = async (field: HTMLInputElement, value: string) => {
  field.value = value
  field.dispatchEvent(new Event('input', { bubbles: true }))
  await flush()
}

test('controlled state updates keep the row and focused input', async () => {
  const value = state([{ key: 'a', value: 'one' }])
  const { container } = render(() => <KeyValueEditor label="Data" value={value} />)
  const row = container.querySelector('tbody tr')!
  const field = input(container, 1)
  field.focus()
  value.value = [{ key: 'b', value: 'two' }]
  await flush()
  expect(input(container, 0).value).toBe('b')
  expect(field.value).toBe('two')
  expect(container.querySelector('tbody tr')).toBe(row)
  expect(document.activeElement).toBe(field)
})

test('plain controlled values follow their live getter', async () => {
  const value = state([{ key: 'a', value: 'one' }])
  const { container } = render(() => <KeyValueEditor label="Data" value={value.value} />)
  const row = container.querySelector('tbody tr')!
  value.value = [{ key: 'b', value: 'two' }]
  await flush()
  expect(input(container, 0).value).toBe('b')
  expect(input(container, 1).value).toBe('two')
  expect(container.querySelector('tbody tr')).toBe(row)
})

test('uncontrolled editing, reset, and mode switches keep values live', async () => {
  const { container } = render(() => (
    <form>
      <KeyValueEditor label="Data" json defaultValue={[{ key: 'a', value: 'one' }]} />
    </form>
  ))
  await tick()
  await flush()
  const first = input(container, 1)
  first.focus()
  await change(first, 'two')
  expect(input(container, 1)).toBe(first)
  expect(document.activeElement).toBe(first)
  container.querySelector<HTMLInputElement>('input[type="radio"][value="json"]')!.click()
  await flush()
  expect(container.querySelector('textarea')!.value).toContain('two')
  container.querySelector<HTMLInputElement>('input[type="radio"][value="form"]')!.click()
  await flush()
  expect(input(container, 1).value).toBe('two')
  container.querySelector('form')!.reset()
  await tick()
  await flush()
  expect(input(container, 0).value).toBe('a')
  expect(input(container, 1).value).toBe('one')
})
