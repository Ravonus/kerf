// A page on plain http (a LAN address, a dev box) is not a secure context, and has no crypto.randomUUID.
import { newOrderKey } from '../src/admin'

test('newOrderKey makes a v4 UUID without crypto.randomUUID', () => {
  Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })
  try {
    const a = newOrderKey()
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(newOrderKey()).not.toBe(a)
  } finally {
    Reflect.deleteProperty(crypto, 'randomUUID')
  }
})
