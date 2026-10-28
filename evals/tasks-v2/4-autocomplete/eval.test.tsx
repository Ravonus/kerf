import { screen } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { flush, mount, tick } from '#adapter'
import { CityPicker } from './solution'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

type Call = { q: string; resolve(v: string[]): void }
function setup() {
  const calls: Call[] = []
  const search = vi.fn((q: string, _signal: AbortSignal) =>
    new Promise<string[]>(resolve => { calls.push({ q, resolve }) }))
  const onPick = vi.fn()
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  const h = mount(CityPicker, { search, onPick })
  const box = () => screen.getByLabelText('City') as HTMLInputElement
  return { calls, search, onPick, user, h, box }
}
const options = () => screen.queryAllByRole('option').map(o => o.textContent?.trim())
const selected = () => screen.queryAllByRole('option').filter(o => o.getAttribute('aria-selected') === 'true').map(o => o.textContent?.trim())

async function open(s: ReturnType<typeof setup>, text: string, results: string[]) {
  await s.user.type(s.box(), text)
  await tick(250)
  s.calls[s.calls.length - 1].resolve(results)
  await flush()
}

test('debounces and skips blank text', async () => {
  const s = setup()
  await s.user.type(s.box(), '  ')
  await tick(500)
  expect(s.search).not.toHaveBeenCalled()
  await s.user.clear(s.box())
  await s.user.type(s.box(), 'pa')
  await tick(249)
  expect(s.search).not.toHaveBeenCalled()
  await tick(1)
  expect(s.search).toHaveBeenCalledTimes(1)
  expect(s.search.mock.calls[0][0]).toBe('pa')
})

test('shows suggestions in a listbox', async () => {
  const s = setup()
  await open(s, 'pa', ['Paris', 'Palermo'])
  expect(screen.getByRole('listbox')).toBeTruthy()
  expect(options()).toEqual(['Paris', 'Palermo'])
  expect(selected()).toEqual([])
})

test('arrows move the highlight and Enter picks', async () => {
  const s = setup()
  await open(s, 'pa', ['Paris', 'Palermo', 'Pamplona'])
  await s.user.keyboard('{ArrowDown}{ArrowDown}')
  expect(selected()).toEqual(['Palermo'])
  await s.user.keyboard('{ArrowUp}')
  expect(selected()).toEqual(['Paris'])
  await s.user.keyboard('{ArrowDown}{Enter}')
  expect(s.onPick).toHaveBeenCalledTimes(1)
  expect(s.onPick).toHaveBeenCalledWith('Palermo')
  expect(s.box().value).toBe('Palermo')
  expect(screen.queryByRole('listbox')).toBeNull()
})

test('picking does not start another search or reopen the list', async () => {
  const s = setup()
  await open(s, 'pa', ['Paris'])
  await s.user.keyboard('{ArrowDown}{Enter}')
  await tick(1000)
  await flush()
  expect(s.search).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('listbox')).toBeNull()
})

test('Enter with nothing highlighted picks nothing', async () => {
  const s = setup()
  await open(s, 'pa', ['Paris'])
  await s.user.keyboard('{Enter}')
  expect(s.onPick).not.toHaveBeenCalled()
})

test('Escape closes the suggestions', async () => {
  const s = setup()
  await open(s, 'pa', ['Paris'])
  await s.user.keyboard('{Escape}')
  expect(screen.queryByRole('listbox')).toBeNull()
})

test('an older response arriving last does not replace newer suggestions', async () => {
  const s = setup()
  await s.user.type(s.box(), 'p')
  await tick(250)
  await s.user.type(s.box(), 'a')
  await tick(250)
  expect(s.calls.map(c => c.q)).toEqual(['p', 'pa'])
  s.calls[1].resolve(['Paris'])
  await flush()
  s.calls[0].resolve(['Prague', 'Porto'])
  await flush()
  expect(options()).toEqual(['Paris'])
})

test('typing again after a pick searches again', async () => {
  const s = setup()
  await open(s, 'pa', ['Paris'])
  await s.user.keyboard('{ArrowDown}{Enter}')
  await s.user.type(s.box(), 'x')
  await tick(250)
  expect(s.search).toHaveBeenCalledTimes(2)
  expect(s.search.mock.calls[1][0]).toBe('Parisx')
})

test('no timers left after unmount mid-debounce', async () => {
  const s = setup()
  await s.user.type(s.box(), 'pa')
  s.h.unmount()
  expect(vi.getTimerCount()).toBe(0)
})
