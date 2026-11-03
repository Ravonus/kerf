// A page on plain http (a LAN address, a dev box) is not a secure context, and has no crypto.randomUUID.
// link.ts picks its tab id on import, so a throw there stopped every island on the page.

test('link loads and names its tab without crypto.randomUUID', async () => {
  Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })
  try {
    vi.resetModules()
    const { tab } = await import('../src/link')
    expect(tab).toMatch(/^[0-9a-z]+$/)
  } finally {
    Reflect.deleteProperty(crypto, 'randomUUID')
  }
})
