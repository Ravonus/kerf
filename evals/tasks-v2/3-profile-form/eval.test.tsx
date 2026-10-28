import { screen } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { mount } from '#adapter'
import { ProfileForm } from './solution'

const ada = { id: '1', name: 'Ada', email: 'ada@example.com' }
function setup(user = ada) {
  const onSave = vi.fn()
  const u = userEvent.setup()
  const h = mount(ProfileForm, { user, onSave })
  return { onSave, u, h }
}
const name = () => screen.getByLabelText('Name') as HTMLInputElement
const email = () => screen.getByLabelText('Email') as HTMLInputElement
const save = () => screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement
const dirty = () => screen.queryByTestId('dirty')?.textContent?.trim() ?? null

test('prefilled and clean', () => {
  setup()
  expect(name().value).toBe('Ada')
  expect(email().value).toBe('ada@example.com')
  expect(save().disabled).toBe(true)
  expect(dirty()).toBeNull()
})

test('editing marks dirty; reverting marks clean', async () => {
  const { u } = setup()
  await u.type(name(), 'x')
  expect(dirty()).toBe('Unsaved changes')
  expect(save().disabled).toBe(false)
  await u.type(name(), '{Backspace}')
  expect(dirty()).toBeNull()
  expect(save().disabled).toBe(true)
})

test('invalid email disables save', async () => {
  const { u } = setup()
  await u.clear(email())
  await u.type(email(), 'nope@')
  expect(dirty()).toBe('Unsaved changes')
  expect(save().disabled).toBe(true)
  await u.type(email(), 'x.io')
  expect(save().disabled).toBe(false)
})

test('save sends trimmed values and leaves the form clean', async () => {
  const { u, onSave } = setup()
  await u.clear(name())
  await u.type(name(), '  Ada L  ')
  await u.click(save())
  expect(onSave).toHaveBeenCalledTimes(1)
  expect(onSave).toHaveBeenCalledWith({ name: 'Ada L', email: 'ada@example.com' })
  expect(dirty()).toBeNull()
  expect(save().disabled).toBe(true)
})

test('switching to another user resets the form, even with edits', async () => {
  const { u, h } = setup()
  await u.type(name(), 'zzz')
  await h.setProps({ user: { id: '2', name: 'Grace', email: 'grace@example.com' } })
  expect(name().value).toBe('Grace')
  expect(email().value).toBe('grace@example.com')
  expect(dirty()).toBeNull()
})

test('a refreshed copy of the same user updates a clean form', async () => {
  const { h } = setup()
  await h.setProps({ user: { ...ada, name: 'Ada Lovelace' } })
  expect(name().value).toBe('Ada Lovelace')
  expect(dirty()).toBeNull()
})

test('a refreshed copy does not throw away what is being typed', async () => {
  const { u, h } = setup()
  await u.clear(name())
  await u.type(name(), 'Typing')
  await h.setProps({ user: { ...ada, email: 'new@example.com' } })
  expect(name().value).toBe('Typing')
  expect(dirty()).toBe('Unsaved changes')
})

test('after saving, the parent echoing the saved values keeps it clean', async () => {
  const { u, h } = setup()
  await u.clear(name())
  await u.type(name(), 'Ada L')
  await u.click(save())
  await h.setProps({ user: { ...ada, name: 'Ada L' } })
  expect(name().value).toBe('Ada L')
  expect(dirty()).toBeNull()
})
