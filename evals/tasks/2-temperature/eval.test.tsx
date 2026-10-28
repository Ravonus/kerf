import { screen } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { mount } from '#adapter'
import { TemperatureConverter } from './solution'

const c = () => screen.getByLabelText('Celsius') as HTMLInputElement
const f = () => screen.getByLabelText('Fahrenheit') as HTMLInputElement

test('starts empty', () => {
  mount(TemperatureConverter, {})
  expect(c().value).toBe('')
  expect(f().value).toBe('')
})

test('celsius to fahrenheit', async () => {
  const user = userEvent.setup()
  mount(TemperatureConverter, {})
  await user.type(c(), '100')
  expect(f().value).toBe('212')
  expect(c().value).toBe('100')
})

test('fahrenheit to celsius', async () => {
  const user = userEvent.setup()
  mount(TemperatureConverter, {})
  await user.type(f(), '32')
  expect(c().value).toBe('0')
  await user.clear(f())
  await user.type(f(), '50')
  expect(c().value).toBe('10')
})

test('the field being typed keeps its exact text', async () => {
  const user = userEvent.setup()
  mount(TemperatureConverter, {})
  await user.type(c(), '1.')
  expect(c().value).toBe('1.')
  expect(f().value).toBe('33.8')
  await user.type(c(), '25')
  expect(c().value).toBe('1.25')
  expect(f().value).toBe('34.3')
})

test('rounds the converted value to one decimal', async () => {
  const user = userEvent.setup()
  mount(TemperatureConverter, {})
  await user.type(f(), '100')
  expect(c().value).toBe('37.8')
  expect(f().value).toBe('100')
  await user.clear(c())
  await user.type(c(), '36.6')
  expect(f().value).toBe('97.9')
  expect(c().value).toBe('36.6')
})

test('invalid text leaves the other field alone', async () => {
  const user = userEvent.setup()
  mount(TemperatureConverter, {})
  await user.type(c(), '100')
  await user.type(c(), 'x')
  expect(c().value).toBe('100x')
  expect(f().value).toBe('212')
})

test('clearing a field clears the other', async () => {
  const user = userEvent.setup()
  mount(TemperatureConverter, {})
  await user.type(c(), '5')
  await user.clear(c())
  expect(f().value).toBe('')
})

test('negative numbers, including the bare minus sign', async () => {
  const user = userEvent.setup()
  mount(TemperatureConverter, {})
  await user.type(c(), '-')
  expect(c().value).toBe('-')
  expect(f().value).toBe('')
  await user.type(c(), '40')
  expect(c().value).toBe('-40')
  expect(f().value).toBe('-40')
})

test('switching fields back and forth', async () => {
  const user = userEvent.setup()
  mount(TemperatureConverter, {})
  await user.type(c(), '10')
  expect(f().value).toBe('50')
  await user.clear(f())
  await user.type(f(), '212')
  expect(c().value).toBe('100')
  expect(f().value).toBe('212')
  await user.type(c(), '.5')
  expect(c().value).toBe('100.5')
  expect(f().value).toBe('212.9')
})
