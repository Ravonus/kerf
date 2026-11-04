import { screen } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { flush, mount, tick } from '#adapter'
import { SearchBox } from './solution'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

type Call = { q: string; signal: AbortSignal; resolve(v: string[]): void; reject(e: unknown): void }
function setup() {
  const calls: Call[] = []
  const search = vi.fn(
    (q: string, signal: AbortSignal) =>
      new Promise<string[]>((resolve, reject) => {
        calls.push({ q, signal, resolve, reject })
      }),
  )
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  const h = mount(SearchBox, { search })
  const box = () => screen.getByLabelText('Search') as HTMLInputElement
  return { calls, search, user, h, box }
}
const status = () => screen.queryByTestId('status')?.textContent?.trim() ?? null
const items = () => screen.queryAllByRole('listitem').map((li) => li.textContent?.trim())

test('debounces by 300 ms', async () => {
  const { user, box, search } = setup()
  await user.type(box(), 'ab')
  await tick(299)
  expect(search).not.toHaveBeenCalled()
  await tick(1)
  expect(search).toHaveBeenCalledTimes(1)
  expect(search.mock.calls[0][0]).toBe('ab')
})

test('loading, then results', async () => {
  const { user, box, calls } = setup()
  await user.type(box(), 'ab')
  await tick(300)
  expect(status()).toBe('Loading')
  calls[0].resolve(['abc', 'abd'])
  await flush()
  expect(items()).toEqual(['abc', 'abd'])
  expect(status()).toBeNull()
  expect(screen.getByRole('list', { name: 'Results' })).toBeTruthy()
})

test('no results', async () => {
  const { user, box, calls } = setup()
  await user.type(box(), 'zz')
  await tick(300)
  calls[0].resolve([])
  await flush()
  expect(status()).toBe('No results')
  expect(items()).toEqual([])
})

test('error', async () => {
  const { user, box, calls } = setup()
  await user.type(box(), 'zz')
  await tick(300)
  calls[0].reject(new Error('boom'))
  await flush()
  expect(status()).toBe('Error')
})

test('stale responses are ignored and the old request is aborted', async () => {
  const { user, box, calls } = setup()
  await user.type(box(), 'a')
  await tick(300)
  await user.type(box(), 'b')
  await tick(300)
  expect(calls.map((c) => c.q)).toEqual(['a', 'ab'])
  expect(calls[0].signal.aborted).toBe(true)
  calls[0].resolve(['stale'])
  await flush()
  expect(items()).toEqual([])
  expect(status()).toBe('Loading')
  calls[1].resolve(['fresh'])
  await flush()
  expect(items()).toEqual(['fresh'])
})

test('stale rejection is ignored', async () => {
  const { user, box, calls } = setup()
  await user.type(box(), 'a')
  await tick(300)
  await user.type(box(), 'b')
  await tick(300)
  calls[0].reject(new DOMException('Aborted', 'AbortError'))
  await flush()
  expect(status()).toBe('Loading')
  calls[1].resolve(['ok'])
  await flush()
  expect(items()).toEqual(['ok'])
})

test('older search resolving after a newer one does not overwrite it', async () => {
  const { user, box, calls } = setup()
  await user.type(box(), 'a')
  await tick(300)
  await user.type(box(), 'b')
  await tick(300)
  calls[1].resolve(['new'])
  await flush()
  calls[0].resolve(['old'])
  await flush()
  expect(items()).toEqual(['new'])
})

test('clearing the input clears results without searching', async () => {
  const { user, box, calls, search } = setup()
  await user.type(box(), 'a')
  await tick(300)
  calls[0].resolve(['x'])
  await flush()
  await user.clear(box())
  await tick(300)
  expect(search).toHaveBeenCalledTimes(1)
  expect(items()).toEqual([])
  expect(status()).toBeNull()
})

test('whitespace-only input does not search', async () => {
  const { user, box, search } = setup()
  await user.type(box(), '   ')
  await tick(300)
  expect(search).not.toHaveBeenCalled()
  expect(status()).toBeNull()
})

test('unmount aborts the in-flight search', async () => {
  const { user, box, calls, h } = setup()
  await user.type(box(), 'a')
  await tick(300)
  h.unmount()
  expect(calls[0].signal.aborted).toBe(true)
})
