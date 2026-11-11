import { state } from '@kerf/core'
import { render } from '@kerf/core/test'
import { ApiKeys, type ApiKeysProps } from '../src/admin/ApiKeys'
import { NOW, byText, dialog, field, tick } from './admin/support'

test('T99 key form follows live scopes and expiries without replacing the form', async () => {
  const scopes = state([{ value: 'read', label: 'Read first' }])
  const expiries = state([
    { value: '90', label: 'Quarter' },
    { value: 'never', label: 'Never' },
  ])
  const props: ApiKeysProps = {
    keys: [],
    now: NOW,
    get scopes() {
      return scopes.value
    },
    get expiries() {
      return expiries.value
    },
    onCreate: () => Promise.resolve('secret'),
    onRevoke: () => {},
  }
  const { container } = render(() => ApiKeys(props))
  byText(container, 'Create test key').click()
  await tick()
  const d = dialog()
  const name = field(d, 'Key name')
  const select = d.querySelector('select')!
  const quarter = select.querySelector('option[value="90"]')!
  expect(d.textContent).toContain('Read first')
  expect(select.textContent).toContain('Quarter')
  name.focus()
  scopes.value = [{ value: 'read', label: 'Read changed' }]
  expiries.value = [
    { value: '90', label: 'Three months' },
    { value: '30', label: 'One month' },
  ]
  await tick()
  expect(dialog()).toBe(d)
  expect(field(d, 'Key name')).toBe(name)
  expect(document.activeElement).toBe(name)
  expect(d.querySelector('select')).toBe(select)
  expect(select.querySelector('option[value="90"]')).not.toBe(quarter)
  expect(select.textContent).toContain('Three months')
  expect(select.textContent).toContain('One month')
  expect(select.textContent).not.toContain('Never')
  expect(d.textContent).toContain('Read changed')
})
