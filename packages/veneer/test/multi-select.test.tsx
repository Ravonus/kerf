// MultiSelect: Select's list, where a pick turns a row on or off and the list stays open.
import { state } from '@kerf/core'
import { MultiSelect } from '../src/index'
import { fruit, mount, tick } from './select/support'

afterEach(() => {
  document.body.innerHTML = ''
})

test('picks toggle, the list stays open, the trigger names them, and a form gets one field per value', async () => {
  const on = state<string[]>([])
  const { c, trigger, value } = await mount(() => (
    <form>
      <MultiSelect
        label="Fruit"
        name="fruit"
        placeholder="Anything"
        options={fruit}
        value={on}
        show={1}
      />
    </form>
  ))
  trigger.click()
  await tick()
  const rows = [...c.querySelectorAll<HTMLElement>('[role="option"]')]
  expect(rows.map((r) => r.textContent)).toEqual(['Apple', 'Bean', 'Corn', 'Cress']) // no placeholder row
  expect(c.querySelector('[role="listbox"]')!.getAttribute('aria-multiselectable')).toBe('true')
  rows[0]!.click()
  await tick()
  rows[2]!.click()
  await tick()
  expect(on.value).toEqual(['a', 'c'])
  expect(trigger.getAttribute('aria-expanded')).toBe('true')
  expect(value.textContent).toBe('Apple +1')
  expect(rows.map((r) => r.getAttribute('aria-selected'))).toEqual([
    'true',
    'false',
    'true',
    'false',
  ])
  expect(new FormData(c.querySelector('form')!).getAll('fruit')).toEqual(['a', 'c'])
  rows[0]!.click()
  await tick()
  expect(on.value).toEqual(['c'])
  expect(value.textContent).toBe('Corn')
})
