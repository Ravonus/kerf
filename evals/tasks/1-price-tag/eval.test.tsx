import { screen } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { mount } from '#adapter'
import { PriceTag } from './solution'

const base = { productId: 'a', unitPrice: 10, taxRate: 0.1, initialQty: 2 }
const qty = () => screen.getByLabelText('Quantity') as HTMLInputElement
const text = (id: string) => screen.getByTestId(id).textContent?.trim()

test('renders initial totals', () => {
  mount(PriceTag, base)
  expect(qty().value).toBe('2')
  expect(text('subtotal')).toBe('Subtotal: $20.00')
  expect(text('total')).toBe('Total: $22.00')
})

test('price and tax props update totals', async () => {
  const h = mount(PriceTag, base)
  await h.setProps({ unitPrice: 12.5 })
  expect(text('subtotal')).toBe('Subtotal: $25.00')
  expect(text('total')).toBe('Total: $27.50')
  await h.setProps({ taxRate: 0.2 })
  expect(text('total')).toBe('Total: $30.00')
})

test('typing a quantity updates totals', async () => {
  const user = userEvent.setup()
  mount(PriceTag, base)
  await user.clear(qty())
  await user.type(qty(), '3')
  expect(text('subtotal')).toBe('Subtotal: $30.00')
  expect(text('total')).toBe('Total: $33.00')
})

test('empty quantity counts as zero', async () => {
  const user = userEvent.setup()
  mount(PriceTag, base)
  await user.clear(qty())
  expect(text('subtotal')).toBe('Subtotal: $0.00')
  expect(text('total')).toBe('Total: $0.00')
})

test('edited quantity survives price changes', async () => {
  const user = userEvent.setup()
  const h = mount(PriceTag, base)
  await user.clear(qty())
  await user.type(qty(), '5')
  await h.setProps({ unitPrice: 2 })
  expect(qty().value).toBe('5')
  expect(text('subtotal')).toBe('Subtotal: $10.00')
})

test('new product resets quantity to its initialQty', async () => {
  const user = userEvent.setup()
  const h = mount(PriceTag, base)
  await user.clear(qty())
  await user.type(qty(), '9')
  await h.setProps({ productId: 'b', initialQty: 4 })
  expect(qty().value).toBe('4')
  expect(text('subtotal')).toBe('Subtotal: $40.00')
})

test('initialQty change alone keeps the user edit', async () => {
  const user = userEvent.setup()
  const h = mount(PriceTag, base)
  await user.clear(qty())
  await user.type(qty(), '7')
  await h.setProps({ initialQty: 1 })
  expect(qty().value).toBe('7')
  expect(text('subtotal')).toBe('Subtotal: $70.00')
})
