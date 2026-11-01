// @vitest-environment node
// A server's counter and a client's never agree, so their ids live in separate spaces: an id made after hydration
// can't collide with one the server wrote (a colliding Field label pointed at the wrong input).
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

test('server ids and client ids never share a value', async () => {
  const server = (await import('../src/store')).uid
  vi.resetModules()
  vi.stubGlobal('document', {})
  const client = (await import('../src/store')).uid
  const a = [server('field'), server('field')]
  const b = [client('field'), client('field')]
  expect(a).toEqual(['field-s0', 'field-s1'])
  expect(b).toEqual(['field-0', 'field-1'])
})
