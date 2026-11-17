import { stamped } from '../src/server/request'

test('request stamping preserves later cancellation without consuming the body', async () => {
  const controller = new AbortController()
  const incoming = new Request('http://local/upload', {
    method: 'POST',
    body: 'untouched',
    signal: controller.signal,
  })
  const request = stamped(incoming)
  let aborted = false
  request.signal.addEventListener('abort', () => (aborted = true))
  expect(await request.text()).toBe('untouched')
  controller.abort('client left')
  expect(aborted).toBe(true)
  expect(request.signal.aborted).toBe(true)
  expect(request.signal.reason).toBe('client left')
})

test('request stamping preserves cancellation that happened before routing', () => {
  const controller = new AbortController()
  controller.abort('already gone')
  const request = stamped(new Request('http://local/events', { signal: controller.signal }))
  expect(request.signal.aborted).toBe(true)
  expect(request.signal.reason).toBe('already gone')
})
