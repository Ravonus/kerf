import { screen } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { flush, mount } from '#adapter'
import { InlineEdit } from './solution'

function setup(value = 'Hello') {
  const onSave = vi.fn()
  const user = userEvent.setup()
  const h = mount(InlineEdit, { value, onSave })
  return { onSave, user, h }
}
const display = () => screen.getByTestId('display').textContent?.trim()
const input = () => screen.getByRole('textbox', { name: 'Title' }) as HTMLInputElement
const editBtn = () => screen.getByRole('button', { name: 'Edit' })

test('display mode', () => {
  setup()
  expect(display()).toBe('Hello')
  expect(editBtn()).toBeTruthy()
  expect(screen.queryByRole('textbox')).toBeNull()
})

test('edit focuses the input with all text selected', async () => {
  const { user } = setup()
  await user.click(editBtn())
  await flush()
  const el = input()
  expect(el.value).toBe('Hello')
  expect(document.activeElement).toBe(el)
  expect(el.selectionStart).toBe(0)
  expect(el.selectionEnd).toBe(5)
})

test('Enter saves once and returns focus to Edit', async () => {
  const { user, onSave } = setup()
  await user.click(editBtn())
  await flush()
  await user.keyboard('World{Enter}')
  await flush()
  expect(onSave).toHaveBeenCalledTimes(1)
  expect(onSave).toHaveBeenCalledWith('World')
  expect(display()).toBe('World')
  expect(screen.queryByRole('textbox')).toBeNull()
  expect(document.activeElement).toBe(editBtn())
})

test('Escape cancels and returns focus to Edit', async () => {
  const { user, onSave } = setup()
  await user.click(editBtn())
  await flush()
  await user.keyboard('Nope{Escape}')
  await flush()
  expect(onSave).not.toHaveBeenCalled()
  expect(display()).toBe('Hello')
  expect(document.activeElement).toBe(editBtn())
  await user.click(document.body)
  expect(onSave).not.toHaveBeenCalled()
})

test('blur saves', async () => {
  const { user, onSave } = setup()
  await user.click(editBtn())
  await flush()
  await user.keyboard('Blurred')
  input().blur()
  await flush()
  expect(onSave).toHaveBeenCalledTimes(1)
  expect(onSave).toHaveBeenCalledWith('Blurred')
  expect(display()).toBe('Blurred')
})

test('parent value updates the display and the next edit', async () => {
  const { user, h } = setup()
  await h.setProps({ value: 'From parent' })
  await flush()
  expect(display()).toBe('From parent')
  await user.click(editBtn())
  await flush()
  expect(input().value).toBe('From parent')
})

test('saved text persists until the parent changes value', async () => {
  const { user, h } = setup()
  await user.click(editBtn())
  await flush()
  await user.keyboard('Local{Enter}')
  await flush()
  expect(display()).toBe('Local')
  await h.setProps({ value: 'Server' })
  await flush()
  expect(display()).toBe('Server')
})
